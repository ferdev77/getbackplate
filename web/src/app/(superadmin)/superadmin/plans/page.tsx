import {
  BadgeDollarSign,
  Building2,
  ChevronDown,
  ShieldCheck,
  Zap,
  Layers,
  HardDrive,
  Users2,
  AlertCircle,
  Trash2,
  FileText,
} from "lucide-react";
import * as motion from "framer-motion/client";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  createPlanAction,
  deletePlanAction,
  updatePlanAction,
} from "@/modules/plans/actions";
import { ConfirmSubmitButton } from "@/shared/ui/confirm-submit-button";
import { PageContent } from "@/shared/ui/page-content";
import { PlanFormModal } from "./plan-form-client";

type SuperadminPlansPageProps = {
  searchParams: Promise<{ status?: string; message?: string; plan?: string; filter?: string }>;
};

function money(amount: number | null, currency = "USD") {
  if (amount === null || amount === undefined) return "Sin precio";
  return new Intl.NumberFormat("es-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function SuperadminPlansPage({ searchParams }: SuperadminPlansPageProps) {
  const supabase = createSupabaseAdminClient();
  const params = await searchParams;
  const status = params.status;
  const message = params.message;
  const filter = params.filter ?? "todos";

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

        <div className="mb-6 flex items-center gap-2 px-2">
          {(["todos", "plataforma", "integracion"] as const).map((tab) => {
            const labels = { todos: "Todos", plataforma: "Plataforma", integracion: "Integración" };
            const active = filter === tab;
            return (
              <a
                key={tab}
                href={tab === "todos" ? "?" : `?filter=${tab}`}
                className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                  active
                    ? "border-[var(--gbp-primary)] bg-[var(--gbp-primary)] text-white"
                    : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                }`}
              >
                {labels[tab]}
              </a>
            );
          })}
        </div>

        <div className="grid gap-6">
          {(plans ?? [])
            .filter((plan) => {
              const isIntegration = (plan as Record<string, unknown>).plan_type === "qbo_r365";
              if (filter === "plataforma") return !isIntegration;
              if (filter === "integracion") return isIntegration;
              return true;
            })
            .map((plan) => {
            const usedCount = usageMap.get(plan.id) ?? 0;
            const selectedSet = planModuleMap.get(plan.id) ?? new Set<string>();
            const activeModules = (modulesCatalog ?? []).filter(m => selectedSet.has(m.id));
            const isIntegration = (plan as Record<string, unknown>).plan_type === "qbo_r365";

            return (
              <motion.article
                key={plan.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="group relative overflow-hidden rounded-[2rem] border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6 transition-all hover:bg-[var(--gbp-surface)] hover:shadow-xl sm:p-8"
              >
                <div className="absolute right-0 top-0 h-2 w-full bg-gradient-to-r from-transparent via-brand/10 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${plan.is_active ? "bg-brand/5 text-brand" : "bg-muted text-muted-foreground"}`}>
                          <Zap className="h-6 w-6" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/60">{plan.code}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-xl border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] ${isIntegration ? "border-violet-200 bg-violet-50 text-violet-700" : "border-blue-100 bg-blue-50/50 text-blue-600"}`}>
                          {isIntegration ? "QBO↔R365" : "Platform"}
                        </span>
                        <span className={`rounded-xl border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.11em] ${plan.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-line bg-muted/20 text-muted-foreground"}`}>
                          {plan.is_active ? "Publicado" : "Borrador"}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/60 line-clamp-2 italic">{plan.description || "Sin descripción comercial definida."}</p>

                    <div className="flex flex-wrap gap-6 pt-2">
                      {(!isIntegration || plan.stripe_price_id) && (
                        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <BadgeDollarSign className="h-5 w-5 text-brand" />
                          <span>{money(plan.price_amount, plan.currency_code ?? "USD")}</span>
                          <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">/ {plan.billing_period}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                        <span>{usedCount} <span className="text-[11px] uppercase tracking-[0.08em] opacity-60">Clientes</span></span>
                      </div>
                      {plan.stripe_price_id ? (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600" title={`ID: ${plan.stripe_price_id}`}>
                          <BadgeDollarSign className="h-4 w-4" />
                          <span className="font-bold">Enlazado a Stripe</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-500">
                          <AlertCircle className="h-4 w-4" />
                          <span>Sin vincular a Stripe</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Limits / Integration stats */}
                  {isIntegration ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
                      <div className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                        <FileText className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">Facturas incluidas</p>
                        <p className="mt-1 text-lg font-black text-foreground">
                          {(plan as Record<string, unknown>).invoices_included != null
                            ? String((plan as Record<string, unknown>).invoices_included)
                            : "∞"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                        <BadgeDollarSign className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">Setup Fee</p>
                        <p className="mt-1 text-lg font-black text-foreground">
                          {(plan as Record<string, unknown>).setup_fee_amount
                            ? money((plan as Record<string, unknown>).setup_fee_amount as number)
                            : "Sin fee"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                      {[
                        { label: "Locaciones", val: plan.max_branches, icon: Building2 },
                        { label: "Usuarios", val: plan.max_users, icon: Users2 },
                        { label: "Empleados", val: plan.max_employees, icon: Layers },
                        { label: "Storage (MB)", val: plan.max_storage_mb, icon: HardDrive },
                      ].map(limit => (
                        <div key={limit.label} className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                          <limit.icon className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                          <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">{limit.label}</p>
                          <p className="mt-1 text-lg font-black text-foreground">{limit.val || "∞"}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-col gap-3 lg:w-48">
                    {/* Module list (platform only) */}
                    {!isIntegration && (
                      <details className="group/details">
                        <summary className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 text-xs font-bold text-foreground cursor-pointer transition-colors hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)]">
                          <span>{activeModules.length} Módulos</span>
                          <ChevronDown className="h-4 w-4 transition-transform group-open/details:rotate-180" />
                        </summary>
                        <div className="absolute right-6 top-full mt-2 z-50 w-64 rounded-[1.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-2xl backdrop-blur-xl">
                          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.11em] text-brand">Capacidades del Plan</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                            {activeModules.map(m => (
                              <div key={m.id} className="flex items-center gap-2 text-[11px] font-semibold text-foreground/80">
                                <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                {m.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      </details>
                    )}

                    <PlanFormModal
                      mode="edit"
                      formAction={updatePlanAction}
                      plan={{
                        id: plan.id,
                        code: plan.code,
                        name: plan.name,
                        description: plan.description ?? null,
                        is_active: plan.is_active,
                        price_amount: plan.price_amount ?? null,
                        currency_code: plan.currency_code ?? null,
                        billing_period: plan.billing_period ?? null,
                        max_branches: plan.max_branches ?? null,
                        max_users: plan.max_users ?? null,
                        max_employees: plan.max_employees ?? null,
                        max_storage_mb: plan.max_storage_mb ?? null,
                        stripe_price_id: plan.stripe_price_id ?? null,
                        plan_type: (plan as Record<string, unknown>).plan_type as string ?? null,
                        is_featured: (plan as Record<string, unknown>).is_featured as boolean ?? null,
                        is_enterprise: (plan as Record<string, unknown>).is_enterprise as boolean ?? null,
                        setup_fee_amount: (plan as Record<string, unknown>).setup_fee_amount as number ?? null,
                        setup_fee_annual_discount_pct: (plan as Record<string, unknown>).setup_fee_annual_discount_pct as number ?? 25,
                        max_r365_connections: (plan as Record<string, unknown>).max_r365_connections as number | null ?? null,
                        features: (plan as Record<string, unknown>).features ?? null,
                        cta_text: (plan as Record<string, unknown>).cta_text as string ?? null,
                        cta_email: (plan as Record<string, unknown>).cta_email as string ?? null,
                        sort_order: (plan as Record<string, unknown>).sort_order as number ?? null,
                        invoices_included: (plan as Record<string, unknown>).invoices_included as number ?? null,
                      }}
                      modulesCatalog={moduleCatalogList}
                      selectedModuleIds={Array.from(selectedSet)}
                    />

                    <form action={deletePlanAction}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <ConfirmSubmitButton
                        label=""
                        disabled={usedCount > 0}
                        confirmTitle="Protocolo de Destrucción de Plan"
                        confirmDescription={`Está a punto de eliminar el plan "${plan.name}". Esta acción es irreversible y solo permitida si no hay clientes asociados.`}
                        confirmLabel="Confirmar Eliminación"
                        className={`w-full h-11 rounded-xl flex items-center justify-center transition-all ${
                          usedCount > 0
                            ? "bg-muted/50 text-muted-foreground cursor-not-allowed border border-line/20"
                            : "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                        }`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
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
