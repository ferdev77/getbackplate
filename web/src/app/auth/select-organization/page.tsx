import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { selectOrganizationAction } from "@/modules/auth/actions";
import { getCurrentUserMemberships } from "@/modules/memberships/queries";
import { SubmitButton } from "@/shared/ui/submit-button";


export const metadata: Metadata = {
  title: "Seleccionar empresa | GetBackplate",
};

type SelectOrganizationPageProps = {
  searchParams: Promise<{ error?: string; mode?: string; next?: string }>;
};

const ROLE_LABELS: Record<string, string> = {
  company_admin: "Admin de empresa",
  manager: "Manager",
  employee: "Empleado",
};

export default async function SelectOrganizationPage({ searchParams }: SelectOrganizationPageProps) {
  const params = await searchParams;
  const memberships = await getCurrentUserMemberships();

  if (!memberships.length) {
    redirect(
      "/auth/login?error=" +
        encodeURIComponent("Tu usuario no tiene acceso asignado. Contacta al administrador."),
    );
  }

  const organizationsIds = [...new Set(memberships.map((membership) => membership.organizationId))];
  const supabase = await createSupabaseServerClient();
  const { data: organizations } = await supabase
    .from("organizations")
    .select("id, name")
    .in("id", organizationsIds);

  const organizationNameById = new Map((organizations ?? []).map((item) => [item.id, item.name]));

  const membershipByOrganization = organizationsIds.map((organizationId) => ({
    organizationId,
    organizationName: organizationNameById.get(organizationId) ?? "Empresa",
    memberships: memberships.filter((membership) => membership.organizationId === organizationId),
  }));

  const mode = params.mode === "employee" || params.mode === "company" ? params.mode : "";
  const nextPath = params.next && params.next.startsWith("/") ? params.next : "";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-2xl rounded-2xl border border-line bg-panel p-8 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-brand uppercase">Acceso multiempresa</p>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Selecciona una empresa</h1>
        <p className="mb-6 text-sm text-neutral-600">Tu usuario tiene acceso a varias empresas. Elige donde quieres trabajar ahora.</p>

        {params.error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {params.error}
          </div>
        ) : null}

        <div className="space-y-3">
          {membershipByOrganization.map((organization) => (
            <form key={organization.organizationId} action={selectOrganizationAction} className="rounded-xl border border-line bg-white p-4">
              <input type="hidden" name="organization_id" value={organization.organizationId} />
              <input type="hidden" name="mode" value={mode} />
              <input type="hidden" name="next_path" value={nextPath} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-neutral-900">{organization.organizationName}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {organization.memberships.map((membership) => (
                      <span key={membership.membershipId} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700">
                        {ROLE_LABELS[membership.roleCode] ?? membership.roleCode}
                      </span>
                    ))}
                  </div>
                </div>

                <SubmitButton label="Entrar" pendingLabel="Entrando..." />
              </div>
            </form>
          ))}
        </div>
      </section>
    </main>
  );
}
