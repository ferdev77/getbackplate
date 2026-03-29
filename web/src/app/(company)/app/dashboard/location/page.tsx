import Link from "next/link";
import CompanyDashboardPage from "../page";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";

type DashboardByLocationPageProps = {
  searchParams: Promise<{ branch?: string; q?: string; selectPlanId?: string }>;
};

const DARK_CARD = "[.theme-dark-pro_&]:border-[var(--gbp-border)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[var(--gbp-text2)]";
const DARK_PILL = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface2)] [.theme-dark-pro_&]:text-[var(--gbp-text)]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const DARK_PRIMARY = "[.theme-dark-pro_&]:border-[var(--gbp-accent)] [.theme-dark-pro_&]:bg-[var(--gbp-accent)] [.theme-dark-pro_&]:text-white [.theme-dark-pro_&]:hover:bg-[var(--gbp-accent-hover)]";

export default async function DashboardByLocationPage({ searchParams }: DashboardByLocationPageProps) {
  const params = await searchParams;
  const tenant = await requireTenantModule("dashboard");
  const supabase = await createSupabaseServerClient();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("organization_id", tenant.organizationId)
    .eq("is_active", true)
    .order("name");

  const selectedBranch = params.branch ?? "";
  const selectedBranchName = (branches ?? []).find((branch) => branch.id === selectedBranch)?.name;

  return (
    <>
      <section className="mx-auto w-full max-w-7xl px-4 pt-6 sm:px-6">
        <div className={`mb-4 rounded-xl border border-[#e7e0dc] bg-white px-4 py-3 ${DARK_CARD}`}>
          <p className={`text-xs font-semibold tracking-[0.1em] text-[#8a817b] uppercase ${DARK_MUTED}`}>Vista por locacion</p>
          <p className={`mt-1 text-sm text-[#5f5853] ${DARK_MUTED}`}>Esta vista comparte metricas del dashboard, filtradas por la locacion seleccionada.</p>
          {selectedBranchName ? (
            <p className={`mt-2 inline-flex rounded-full border border-[#d8e4f7] bg-[#eff5ff] px-2 py-0.5 text-xs font-semibold text-[#2d4f86] ${DARK_PILL}`}>
              Locacion activa: {selectedBranchName}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/app/dashboard/location" className={`rounded-md border px-2.5 py-1 text-xs ${!selectedBranch ? `border-[#111] bg-[#111] text-white ${DARK_PRIMARY}` : `border-[#ddd] bg-white text-[#555] ${DARK_GHOST}`}`}>Todas</Link>
            {(branches ?? []).map((branch) => (
              <Link key={branch.id} href={`/app/dashboard/location?branch=${branch.id}`} className={`rounded-md border px-2.5 py-1 text-xs ${selectedBranch === branch.id ? `border-[#111] bg-[#111] text-white ${DARK_PRIMARY}` : `border-[#ddd] bg-white text-[#555] ${DARK_GHOST}`}`}>
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
