import type { Metadata } from "next";
import { headers } from "next/headers";

import { requestPasswordRecoveryAction } from "@/modules/auth/actions";
import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { TenantAuthBrand } from "@/shared/ui/tenant-auth-brand";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { TagPill } from "@/shared/ui/tag-pill";

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; status?: string; message?: string; org?: string }>;
};

export async function generateMetadata({ searchParams }: ForgotPasswordPageProps): Promise<Metadata> {
  const params = await searchParams;
  const organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);

  if (!tenantBranding) {
    return {
      title: "Reset password | GetBackplate",
    };
  }

  return {
    title: `Reset password | ${tenantBranding.companyName}`,
    icons: tenantBranding.faviconUrl
      ? {
          icon: [{ url: tenantBranding.faviconUrl }],
        }
      : undefined,
  };
}

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);
  const effectiveOrganizationHint = organizationIdHint || tenantBranding?.organizationHint || "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <div className="mb-4 flex items-center">
            <TagPill>Recovery</TagPill>
          </div>

          <TenantAuthBrand branding={tenantBranding} caption="Company account recovery" />

          <h1 className="mb-1 text-2xl font-bold tracking-tight">Reset your password</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            We will email you a link to set a new password.
          </p>

          {params.message ? (
            <div
              className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
                params.status === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {params.message}
            </div>
          ) : null}

          {params.error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </div>
          ) : null}

          <form action={requestPasswordRecoveryAction} className="space-y-4">
            <input type="hidden" name="organization_id_hint" value={effectiveOrganizationHint} />
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

            <SubmitButton
              label="Send link"
              pendingLabel="Sending..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
