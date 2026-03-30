import type { Metadata } from "next";
import Link from "next/link";

import { loginWithPasswordAction } from "@/modules/auth/actions";
import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { TagPill } from "@/shared/ui/tag-pill";
import { ThemeToggle } from "@/shared/ui/theme-toggle";
import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";

export const metadata: Metadata = {
  title: "Login | GetBackplate",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string; org?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = params.error;
  const organizationIdHint = String(params.org ?? "").trim();
  const orgQuery = organizationIdHint ? `?org=${encodeURIComponent(organizationIdHint)}` : "";
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationIdHint);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <div className="mb-4 flex items-center justify-between gap-2">
            <TagPill variant="accent">Acceso seguro</TagPill>
            <ThemeToggle showLabel={false} />
          </div>

          <div className="mb-5 flex justify-center">
            <ThemeAwareGetBackplateLogo width={230} height={42} className={`${BRAND_SCALE.authHeight} w-auto`} priority />
          </div>

          {tenantBranding ? (
            <div className="mb-5 rounded-[var(--gbp-radius-xl)] border border-[var(--gbp-border)] bg-[linear-gradient(160deg,var(--gbp-surface)_0%,var(--gbp-bg)_100%)] p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">Acceso de empresa</p>
              <div className="flex items-center gap-3">
                <div className="grid min-h-[56px] min-w-[96px] place-items-center rounded-[var(--gbp-radius-lg)] bg-[var(--gbp-surface)] px-2 py-2 shadow-[inset_0_0_0_1px_var(--gbp-border)]">
                  {tenantBranding.logoUrl ? (
                    <picture>
                      {tenantBranding.logoDarkUrl ? (
                        <source media="(prefers-color-scheme: dark)" srcSet={tenantBranding.logoDarkUrl} />
                      ) : null}
                      <img src={tenantBranding.logoUrl} alt={`Logo ${tenantBranding.companyName}`} className="block h-auto max-h-10 w-auto max-w-[88px] object-contain" />
                    </picture>
                  ) : (
                    <span className="text-[10px] font-bold tracking-[0.06em] text-[var(--gbp-text2)] uppercase">{tenantBranding.companyName}</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[var(--gbp-text)]">{tenantBranding.companyName}</p>
                  <p className="text-xs text-[var(--gbp-text2)]">Ingresa al portal de tu organizacion</p>
                </div>
              </div>
            </div>
          ) : null}

          <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Iniciar sesion</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            Ingresa con tus credenciales para acceder al panel.
          </p>

          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <form action={loginWithPasswordAction} className="space-y-4">
            <input type="hidden" name="organization_id_hint" value={organizationIdHint} />
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
                placeholder="admin@empresa.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-[var(--gbp-text)]"
              >
                Contrasena
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="auth-input w-full rounded-[var(--gbp-radius-lg)] border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none ring-[color:color-mix(in_oklab,var(--gbp-accent)_20%,transparent)] placeholder:text-[var(--gbp-muted)] transition focus:ring-2"
                placeholder="********"
              />
              <div className="mt-2 text-right">
                <Link
                  href={`/auth/forgot-password${orgQuery}`}
                  className="text-xs font-medium text-[var(--gbp-accent)] hover:text-[var(--gbp-accent-hover)]"
                >
                  Olvide mi contrasena
                </Link>
              </div>
            </div>

            <SubmitButton
              label="Entrar"
              pendingLabel="Iniciando sesion..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
