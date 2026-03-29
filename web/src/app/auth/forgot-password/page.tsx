import type { Metadata } from "next";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requestPasswordRecoveryAction } from "@/modules/auth/actions";
import { SubmitButton } from "@/shared/ui/submit-button";
import { SlideUp } from "@/shared/ui/animations";

export const metadata: Metadata = {
  title: "Recuperar contrasena | GetBackplate",
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{ error?: string; status?: string; message?: string; org?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordPageProps) {
  const params = await searchParams;
  const organizationIdHint = String(params.org ?? "").trim();

  let tenantBranding: { companyName: string; logoUrl: string; logoDarkUrl: string } | null = null;

  if (organizationIdHint) {
    const admin = createSupabaseAdminClient();
    const { data: organization } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", organizationIdHint)
      .maybeSingle();

    if (organization?.id) {
      const [{ data: moduleRows }, { data: settings }] = await Promise.all([
        admin
          .from("organization_modules")
          .select("module_catalog!inner(code)")
          .eq("organization_id", organization.id)
          .eq("is_enabled", true),
        admin
          .from("organization_settings")
          .select("company_logo_url, company_logo_dark_url")
          .eq("organization_id", organization.id)
          .maybeSingle(),
      ]);

      const customBrandingEnabled = (moduleRows ?? []).some((row) => {
        const catalog = row.module_catalog as unknown as { code?: string | null } | null;
        return catalog?.code === "custom_branding";
      });

      if (customBrandingEnabled) {
        tenantBranding = {
          companyName: organization.name ?? "Empresa",
          logoUrl: settings?.company_logo_url ?? "",
          logoDarkUrl: settings?.company_logo_dark_url ?? "",
        };
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <SlideUp className="w-full max-w-md">
        <section className="rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
          {tenantBranding ? (
            <div className="mb-5 rounded-xl border border-[#eadfd8] bg-[linear-gradient(160deg,#fffaf7_0%,#f8f1ec_100%)] p-3">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-[#9b6c52] uppercase">Recuperacion de empresa</p>
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
                  <p className="text-xs text-[#7e7068]">Te ayudamos a recuperar acceso a tu portal</p>
                </div>
              </div>
            </div>
          ) : null}

          <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">Acceso</p>
          <h1 className="mb-1 text-2xl font-bold tracking-tight">Recuperar contrasena</h1>
          <p className="mb-6 text-sm text-neutral-600">
            Te enviaremos un enlace para definir una nueva contrasena.
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

            <SubmitButton
              label="Enviar enlace"
              pendingLabel="Enviando..."
              className="w-full"
            />
          </form>
        </section>
      </SlideUp>
    </main>
  );
}
