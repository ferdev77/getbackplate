import Link from "next/link";
import CompanyDashboardPage from "../page";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";
import { getEnabledModules } from "@/modules/organizations/queries";

type DashboardByLocationPageProps = {
  searchParams: Promise<{ branch?: string; q?: string; selectPlanId?: string }>;
};

export default async function DashboardByLocationPage({ searchParams }: DashboardByLocationPageProps) {
  const params = await searchParams;
  const tenant = await requireTenantModule("dashboard");
  const supabase = await createSupabaseServerClient();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, city")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true)
    .order("name");

  const enabledModules = await getEnabledModules(tenant.organizationId);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const mappedBranches = (branches ?? []).map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  const selectedBranch = params.branch ?? "";
  const selectedBranchName = mappedBranches.find((branch) => branch.id === selectedBranch)?.name;

  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6">
        <div className="mb-4 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3">
          <p className="text-xs font-semibold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">Vista por ubicación</p>
          <p className="mt-1 text-sm text-[var(--gbp-text2)]">Esta vista comparte métricas del dashboard, filtradas por la ubicación seleccionada.</p>
          {selectedBranchName ? (
            <p className="mt-2 inline-flex rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-xs font-semibold text-[var(--gbp-accent)]">
              Locación activa: {selectedBranchName}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/app/dashboard/location" className={`rounded-md border px-2.5 py-1 text-xs ${!selectedBranch ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white hover:bg-[var(--gbp-accent-hover)]" : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"}`}>Todas</Link>
            {mappedBranches.map((branch) => (
              <Link key={branch.id} href={`/app/dashboard/location?branch=${branch.id}`} className={`rounded-md border px-2.5 py-1 text-xs ${selectedBranch === branch.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white hover:bg-[var(--gbp-accent-hover)]" : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"}`}>
                {branch.name}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <CompanyDashboardPage searchParams={Promise.resolve(params)} />
    </>
  );
}
