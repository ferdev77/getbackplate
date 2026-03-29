import type { Metadata } from "next";
import Link from "next/link";

import { loginWithPasswordAction } from "@/modules/auth/actions";
import { resolveTenantAuthBrandingByHint } from "@/shared/lib/tenant-auth-branding";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";

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
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          {tenantBranding ? (
            <div className="mb-5 rounded-xl border border-[#eadfd8] bg-[linear-gradient(160deg,#fffaf7_0%,#f8f1ec_100%)] p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-[#9b6c52] uppercase">Acceso de empresa</p>
              <div className="flex items-center gap-3">
                <div className="grid min-h-[56px] min-w-[96px] place-items-center rounded-lg bg-white px-2 py-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]">
                  {tenantBranding.logoUrl ? (
                    <picture>
                      {tenantBranding.logoDarkUrl ? (
                        <source media="(prefers-color-scheme: dark)" srcSet={tenantBranding.logoDarkUrl} />
                      ) : null}
                      <img src={tenantBranding.logoUrl} alt={`Logo ${tenantBranding.companyName}`} className="block h-auto max-h-10 w-auto max-w-[88px] object-contain" />
                    </picture>
                  ) : (
                    <span className="text-[10px] font-bold tracking-[0.06em] text-[#8f7e72] uppercase">{tenantBranding.companyName}</span>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#33261f]">{tenantBranding.companyName}</p>
                  <p className="text-xs text-[#7e7068]">Ingresa al portal de tu organizacion</p>
                </div>
              </div>
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">
            Acceso seguro
          </p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Iniciar sesion</h1>
          <p className="mb-6 text-sm text-neutral-600">
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
              <label htmlFor="email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="admin@empresa.com"
              />
            </div>
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium"
              >
                Contrasena
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none ring-brand/20 transition focus:ring-2"
                placeholder="********"
              />
              <div className="mt-2 text-right">
                <Link
                  href={`/auth/forgot-password${orgQuery}`}
                  className="text-xs font-medium text-brand hover:text-brand-dark"
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
