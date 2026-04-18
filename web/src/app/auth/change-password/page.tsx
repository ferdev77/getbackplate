import type { Metadata } from "next";
import { headers } from "next/headers";

import { updatePasswordAction } from "@/modules/auth/actions";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";
import { PasswordInput } from "@/shared/ui/password-input";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";
import { TagPill } from "@/shared/ui/tag-pill";

type ChangePasswordPageProps = {
  searchParams: Promise<{ error?: string; reason?: string; next?: string; org?: string }>;
};

export async function generateMetadata({ searchParams }: ChangePasswordPageProps): Promise<Metadata> {
  const params = await searchParams;
  const organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);

  if (!tenantBranding) {
    return {
      title: "Cambiar contraseña | GetBackplate",
    };
  }

  return {
    title: `Cambiar contraseña | ${tenantBranding.companyName}`,
    icons: tenantBranding.faviconUrl
      ? {
          icon: [{ url: tenantBranding.faviconUrl }],
        }
      : undefined,
  };
}

export default async function ChangePasswordPage({ searchParams }: ChangePasswordPageProps) {
  const params = await searchParams;
  const reason = params.reason;
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "";
  let organizationIdHint = String(params.org ?? "").trim();
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  if (!organizationIdHint) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.id) {
      const admin = createSupabaseAdminClient();
      const { data: memberships } = await admin
        .from("memberships")
        .select("organization_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(2);

      if (memberships?.length === 1 && memberships[0]?.organization_id) {
        organizationIdHint = memberships[0].organization_id;
      }
    }
  }

  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint, requestHost);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <div className="mb-4 flex items-center">
            <TagPill variant="violet">Seguridad</TagPill>
          </div>
          {tenantBranding ? (
            <div className="mb-6 flex flex-col items-center justify-center text-center">
              <div className="grid min-h-[92px] min-w-[240px] place-items-center rounded-[var(--gbp-radius-xl)] border border-[var(--gbp-border)] bg-[linear-gradient(160deg,var(--gbp-surface)_0%,var(--gbp-bg)_100%)] px-4 py-4">
                {tenantBranding.logoUrl ? (
                  <picture>
                    {tenantBranding.logoDarkUrl ? (
                      <source media="(prefers-color-scheme: dark)" srcSet={tenantBranding.logoDarkUrl} />
                    ) : null}
                    <img src={tenantBranding.logoUrl} alt={`Logo ${tenantBranding.companyName}`} className="block h-auto max-h-14 w-auto max-w-[190px] object-contain" />
                  </picture>
                ) : (
                  <span className="text-sm font-bold tracking-[0.08em] text-[var(--gbp-text)] uppercase">{tenantBranding.companyName}</span>
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--gbp-text2)]">Seguridad de empresa</p>
            </div>
          ) : (
            <div className="mb-5 flex justify-center">
              <ThemeAwareGetBackplateLogo width={230} height={42} className={`${BRAND_SCALE.authHeight} w-auto`} priority />
            </div>
          )}
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Cambiar contraseña</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            {reason === "first_login"
              ? "Por seguridad, debes cambiar la contraseña temporal antes de continuar."
              : "Define tu nueva contraseña para recuperar acceso a la plataforma."}
          </p>

          {params.error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </div>
          ) : null}

          <form action={updatePasswordAction} className="space-y-4">
            <input type="hidden" name="next" value={nextPath} />
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-[var(--gbp-text)]">
                Nueva contraseña
              </label>
              <PasswordInput
                id="password"
                name="password"
                minLength={8}
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="Mínimo 8 caracteres"
              />
            </div>

            <div>
              <label htmlFor="confirm_password" className="mb-1 block text-sm font-medium text-[var(--gbp-text)]">
                Confirmar contraseña
              </label>
              <PasswordInput
                id="confirm_password"
                name="confirm_password"
                minLength={8}
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="Repite la contraseña"
              />
            </div>

            <SubmitButton
              label="Actualizar contraseña"
              pendingLabel="Actualizando..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
