import type { Metadata } from "next";
import Link from "next/link";

import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { ThemeAwareGetBackplateLogo } from "@/shared/ui/theme-aware-getbackplate-logo";
import { BRAND_SCALE } from "@/shared/ui/brand-scale";

export const metadata: Metadata = {
  title: "Confirmar recuperacion | GetBackplate",
};

type RecoveryLinkPageProps = {
  searchParams: Promise<{ k?: string; org?: string; error?: string }>;
};

export default async function RecoveryLinkPage({ searchParams }: RecoveryLinkPageProps) {
  const params = await searchParams;
  const key = String(params.k ?? "").trim();
  const organizationHint = String(params.org ?? "").trim();
  const error = String(params.error ?? "").trim();
  const tenantBranding = await resolveTenantAuthBrandingByHint(organizationHint);
  const forgotPasswordHref = organizationHint
    ? `/auth/forgot-password?org=${encodeURIComponent(organizationHint)}`
    : "/auth/forgot-password";

  if (!key) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
        <section className="w-full max-w-md rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
          <div className="mb-5 flex justify-center">
            <ThemeAwareGetBackplateLogo width={230} height={42} className={`${BRAND_SCALE.authHeight} w-auto`} priority />
          </div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight">Enlace invalido</h1>
          <p className="mb-6 text-sm text-[var(--gbp-text2)]">
            Este enlace de recuperacion no es valido. Solicita uno nuevo para continuar.
          </p>
          <Link
            href={forgotPasswordHref}
            className="inline-flex rounded-[var(--gbp-radius-lg)] bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-[var(--gbp-on-accent)] hover:bg-[var(--gbp-accent-hover)]"
          >
            Solicitar nuevo enlace
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--gbp-surface)_0%,_var(--gbp-bg)_48%,_var(--gbp-bg2)_100%)] px-6 py-10">
      <section className="w-full max-w-md rounded-[var(--gbp-radius-3xl)] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-[var(--gbp-text)] shadow-[var(--gbp-shadow-lg)]">
        <div className="mb-5 flex justify-center">
          <ThemeAwareGetBackplateLogo width={230} height={42} className={`${BRAND_SCALE.authHeight} w-auto`} priority />
        </div>

        {tenantBranding ? (
          <div className="mb-5 rounded-[var(--gbp-radius-xl)] border border-[var(--gbp-border)] bg-[linear-gradient(160deg,var(--gbp-surface)_0%,var(--gbp-bg)_100%)] p-3">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">Recuperacion de empresa</p>
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
                <p className="text-xs text-[var(--gbp-text2)]">Estas por confirmar un acceso seguro al portal</p>
              </div>
            </div>
          </div>
        ) : null}

        <h1 className="mb-2 text-2xl font-bold tracking-tight">Restablecer contrasena</h1>
        <p className="mb-6 text-sm text-[var(--gbp-text2)]">
          Para proteger tu acceso, confirma manualmente y te llevamos al cambio de contrasena.
        </p>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Link
          href={`/auth/recovery-link/continue?k=${encodeURIComponent(key)}${organizationHint ? `&org=${encodeURIComponent(organizationHint)}` : ""}`}
          className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--gbp-accent)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--gbp-shadow-accent)] transition hover:bg-[var(--gbp-accent-hover)]"
        >
          Continuar de forma segura
        </Link>

        <p className="mt-4 text-xs text-[var(--gbp-text2)]">
          Si este enlace no funciona, solicita uno nuevo desde la pantalla de recuperacion.
        </p>
      </section>
    </main>
  );
}
