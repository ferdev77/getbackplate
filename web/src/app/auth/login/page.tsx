import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { loginWithPasswordAction } from "@/modules/auth/actions";
import { resolveTenantAuthBrandingByHint, resolveIntuitSsoAvailability } from "@/shared/lib/tenant-auth-branding";
import { TenantAuthBrand } from "@/shared/ui/tenant-auth-brand";
import { SubmitButton } from "@/shared/ui/submit-button";
import { TagPill } from "@/shared/ui/tag-pill";
import { PasswordInput } from "@/shared/ui/password-input";
import { IntuitSignInButton } from "@/shared/ui/intuit-sign-in-button";
import { GoogleSignInButton } from "@/shared/ui/google-sign-in-button";
import { GooglePopupSignInButton } from "@/shared/ui/google-popup-sign-in-button";
import { getActiveTenantGoogleOAuthConfig } from "@/modules/auth/google-tenant/service";
import { resolveOrganizationIdFromReadyAuthDomain } from "@/shared/lib/custom-domains";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; org?: string; desde?: string }>;
};

export async function generateMetadata({ searchParams }: LoginPageProps): Promise<Metadata> {
  const params = await searchParams;
  const organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);

  if (!tenantBranding) {
    return {
      title: "Login | GetBackplate",
    };
  }

  return {
    title: `Login | ${tenantBranding.companyName}`,
    icons: tenantBranding.faviconUrl
      ? {
          icon: [{ url: tenantBranding.faviconUrl }],
        }
      : undefined,
  };
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error;
  const organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);
  const effectiveOrganizationHint = organizationIdHint || tenantBranding?.organizationHint || "";
  const orgQuery = effectiveOrganizationHint ? `?org=${encodeURIComponent(effectiveOrganizationHint)}` : "";
  const passwordBillingTrack = params.desde === "integracion" ? "integration" : "platform";
  const intuitBillingTrack = params.desde === "plataforma" ? "platform" : "integration";
  const intuitReturnTo = `/app/dashboard?billingTrack=${intuitBillingTrack}`;
  // When the organization is identifiable (custom domain or ?org= hint),
  // its actual qbo_r365 module state is the source of truth. Otherwise
  // (generic login, unknown org) fall back to the explicit ?desde hint and
  // default to hidden — showing an integration-only action to someone who
  // probably doesn't have that plan is worse than requiring the explicit
  // link from the integration landing page.
  const intuitAvailability = await resolveIntuitSsoAvailability(organizationIdHint, requestHost);
  const showIntuitSso = intuitAvailability ?? params.desde === "integracion";

  const googleTrack = passwordBillingTrack === "integration" ? "integracion" : "plataforma";
  const googleHref = `/api/auth/google/start${orgQuery}${orgQuery ? "&" : "?"}desde=${googleTrack}`;
  // La ventana emergente se usa solo donde resuelve algo: en un dominio propio,
  // el boton clasico obliga a saltar al dominio canonico y volver con la sesion
  // por un puente. En el dominio canonico no hay salto que evitar, asi que ahi
  // se deja el camino de siempre. Sin client_id configurado tampoco se activa.
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const googleOrganizationId = await resolveOrganizationIdFromReadyAuthDomain(requestHost).catch(() => null);
  const tenantGoogleActive = googleOrganizationId
    ? await getActiveTenantGoogleOAuthConfig(googleOrganizationId).then(Boolean).catch(() => false)
    : false;
  const useGooglePopup = !tenantGoogleActive && Boolean(googleClientId) && Boolean(tenantBranding);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <div className="w-full max-w-md">
        <section className="rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <div className="mb-4 flex items-center justify-center">
            <TagPill variant="accent">Secure access</TagPill>
          </div>

          <TenantAuthBrand branding={tenantBranding} />

          <h1 className="mb-1 text-center text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Sign in</h1>
          <p className="mb-6 text-center text-sm text-[var(--gbp-text2)]">
            Enter your credentials to access the dashboard.
          </p>

          <div className="mb-4">
            {useGooglePopup ? (
              <GooglePopupSignInButton
                clientId={googleClientId}
                organizationHint={effectiveOrganizationHint}
                billingTrack={googleTrack}
                fallbackHref={googleHref}
              />
            ) : (
              <GoogleSignInButton href={googleHref} />
            )}
          </div>
          {useGooglePopup ? (
            <p className="mb-4 text-center text-[11px] leading-[1.5] text-[var(--gbp-text2)]">
              Vas a autorizar a GetBackplate, la plataforma que opera{" "}
              {tenantBranding?.companyName ?? "tu empresa"}.
            </p>
          ) : null}
          <div className="mb-4 flex items-center gap-3 text-xs text-[var(--gbp-muted)]">
            <span className="h-px flex-1 bg-[var(--gbp-border)]" />
            or
            <span className="h-px flex-1 bg-[var(--gbp-border)]" />
          </div>

          {showIntuitSso ? (
            <>
              <div className="mb-4 flex justify-center">
                <IntuitSignInButton href={`/api/auth/intuit/start?returnTo=${encodeURIComponent(intuitReturnTo)}`} />
              </div>
              <p className="-mt-2 mb-4 text-center text-[11px] text-[var(--gbp-muted)]">
                This verifies your identity only. QuickBooks access is requested separately.
              </p>
              <div className="mb-4 flex items-center gap-3 text-xs text-[var(--gbp-muted)]">
                <span className="h-px flex-1 bg-[var(--gbp-border)]" />
                or
                <span className="h-px flex-1 bg-[var(--gbp-border)]" />
              </div>
            </>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form action={loginWithPasswordAction} className="space-y-4">
            <input type="hidden" name="organization_id_hint" value={effectiveOrganizationHint} />
            <input type="hidden" name="billing_track" value={passwordBillingTrack} />
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-[var(--gbp-text)]">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="admin@company.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-[var(--gbp-text)]"
              >
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="********"
              />
              <div className="mt-2 text-right">
                <Link
                  href={`/auth/forgot-password${orgQuery}`}
                  className="text-xs font-medium text-[var(--gbp-accent)] hover:text-[var(--gbp-accent-hover)]"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>

            <SubmitButton
              label="Sign in"
              pendingLabel="Signing in..."
              className="w-full"
            />
          </form>
        </section>
      </div>
    </main>
  );
}
