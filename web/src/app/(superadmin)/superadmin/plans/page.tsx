import {
  BadgeDollarSign,
  Building2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import * as motion from "framer-motion/client";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  createPlanAction,
  deletePlanAction,
  updatePlanAction,
} from "@/modules/plans/actions";
import { PageContent } from "@/shared/ui/page-content";
import { PlanFormModal } from "./plan-form-client";
import { PlansFilteredList } from "./plans-list-client";

type SuperadminPlansPageProps = {
  searchParams: Promise<{ status?: string; message?: string; plan?: string }>;
};

export default async function SuperadminPlansPage({ searchParams }: SuperadminPlansPageProps) {
  const supabase = createSupabaseAdminClient();
  const params = await searchParams;
  const status = params.status;
  const message = params.message;

  const [
    { data: plans },
    { data: orgsWithPlans },
    { data: modulesCatalog },
    { data: planModules },
  ] = await Promise.all([
    supabase
      .from("plans")
      .select("id, code, name, description, is_active, price_amount, currency_code, billing_period, max_branches, max_users, max_storage_mb, max_employees, stripe_price_id, plan_type, is_featured, is_enterprise, setup_fee_amount, setup_fee_annual_discount_pct, features, cta_text, cta_email, sort_order, invoices_included, max_r365_connections, created_at")
      .order("sort_order", { ascending: true })
      .order("price_amount", { ascending: true }),
    supabase
      .from("organizations")
      .select("plan_id")
      .not("plan_id", "is", null),
    supabase
      .from("module_catalog")
      .select("id, code, name, is_core")
      .order("name"),
    supabase
      .from("plan_modules")
      .select("plan_id, module_id, is_enabled")
      .eq("is_enabled", true),
  ]);

  const usageMap = new Map<string, number>();
  for (const row of orgsWithPlans ?? []) {
    const key = row.plan_id as string;
    usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
  }

  const planModuleMap = new Map<string, Set<string>>();
  for (const row of planModules ?? []) {
    const existing = planModuleMap.get(row.plan_id) ?? new Set<string>();
    existing.add(row.module_id);
    planModuleMap.set(row.plan_id, existing);
  }

  const totalOrgsInAnyPlan = orgsWithPlans?.length ?? 0;
  const moduleCatalogList = (modulesCatalog ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    is_core: m.is_core ?? false,
  }));

  const usageByPlanId: Record<string, number> = {};
  usageMap.forEach((count, planId) => { usageByPlanId[planId] = count; });

  const modulesByPlanId: Record<string, string[]> = {};
  planModuleMap.forEach((moduleSet, planId) => { modulesByPlanId[planId] = Array.from(moduleSet); });

  return (
    <PageContent spacing="roomy" className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative z-10">
          <p className="gbp-page-eyebrow mb-2 text-brand-light/60">Monetización & Escala</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">Planes Maestros</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">
            Estructura tu propuesta comercial. Define límites técnicos, precios y capacidades modulares para cada segmento de clientes.
          </p>
        </div>
      </section>

      {message && (
        <motion.section
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`rounded-[1.25rem] border px-6 py-4 text-sm font-medium shadow-sm ${
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message}
        </motion.section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Planes Definidos", val: plans?.length ?? 0, icon: BadgeDollarSign, color: "text-[var(--gbp-text)]", bg: "bg-[var(--gbp-surface)]" },
          { label: "Empresas en Producción", val: totalOrgsInAnyPlan, icon: Building2, color: "text-emerald-700", bg: "bg-emerald-50/50" },
          { label: "Planes Publicados", val: (plans ?? []).filter(p => p.is_active).length, icon: ShieldCheck, color: "text-blue-700", bg: "bg-blue-50/50" },
        ].map((stat, idx) => (
          <motion.article
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`rounded-3xl border border-[var(--gbp-border)] ${stat.bg} p-5 shadow-sm`}
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.11em] text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" /> {stat.label}
            </p>
            <p className={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.val}</p>
          </motion.article>
        ))}
      </section>

      <section className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm overflow-hidden">
        <div className="mb-8 flex items-center justify-between px-2">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">Gestión de Oferta Comercial</h2>
            <p className="text-xs text-muted-foreground mt-1">Configure los parámetros de crecimiento y costos operativos.</p>
          </div>
          <PlanFormModal
            mode="create"
            formAction={createPlanAction}
            modulesCatalog={moduleCatalogList}
            selectedModuleIds={[]}
          />
        </div>

        <PlansFilteredList
          plans={(plans ?? []) as Parameters<typeof PlansFilteredList>[0]["plans"]}
          moduleCatalogList={moduleCatalogList}
          modulesByPlanId={modulesByPlanId}
          usageByPlanId={usageByPlanId}
          updatePlanAction={updatePlanAction}
          deletePlanAction={deletePlanAction}
        />
      </section>

      <section className="flex items-center gap-4 rounded-[1.5rem] border border-amber-100 bg-amber-50/50 p-6 text-amber-800">
        <AlertCircle className="h-6 w-6 shrink-0" />
        <div>
          <p className="text-sm font-bold">Integridad de Relaciones comerciales</p>
          <p className="text-xs opacity-80 mt-1">
            Los planes con empresas activas no pueden eliminarse. Para dar de baja un plan, primero migre a sus suscriptores a una propuesta de servicio alternativa.
          </p>
        </div>
      </section>
    </PageContent>
  );
}
