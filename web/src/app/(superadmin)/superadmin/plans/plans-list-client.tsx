"use client";

import { useState } from "react";
import * as motion from "framer-motion/client";
import {
  BadgeDollarSign,
  Building2,
  ChevronDown,
  Zap,
  Layers,
  HardDrive,
  Users2,
  AlertCircle,
  Trash2,
  FileText,
} from "lucide-react";

import { PlanFormModal } from "./plan-form-client";
import { ConfirmSubmitButton } from "@/shared/ui/confirm-submit-button";

type Module = { id: string; name: string; is_core: boolean };

type PlanRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  price_amount: number | null;
  currency_code: string | null;
  billing_period: string | null;
  max_branches: number | null;
  max_users: number | null;
  max_storage_mb: number | null;
  max_employees: number | null;
  stripe_price_id: string | null;
  plan_type: string | null;
  is_featured: boolean | null;
  is_enterprise: boolean | null;
  setup_fee_amount: number | null;
  setup_fee_annual_discount_pct: number | null;
  features: unknown;
  cta_text: string | null;
  cta_email: string | null;
  sort_order: number | null;
  invoices_included: number | null;
  max_r365_connections: number | null;
};

type Props = {
  plans: PlanRow[];
  moduleCatalogList: Module[];
  modulesByPlanId: Record<string, string[]>;
  usageByPlanId: Record<string, number>;
  updatePlanAction: (formData: FormData) => Promise<void>;
  deletePlanAction: (formData: FormData) => Promise<void>;
};

type Tab = "todos" | "plataforma" | "integracion";
const TABS: Tab[] = ["todos", "plataforma", "integracion"];
const TAB_LABELS: Record<Tab, string> = {
  todos: "Todos",
  plataforma: "Plataforma",
  integracion: "Integración",
};

function money(amount: number | null, currency = "USD") {
  if (amount === null || amount === undefined) return "Sin precio";
  return new Intl.NumberFormat("es-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  }).format(amount);
}

export function PlansFilteredList({
  plans,
  moduleCatalogList,
  modulesByPlanId,
  usageByPlanId,
  updatePlanAction,
  deletePlanAction,
}: Props) {
  const [filter, setFilter] = useState<Tab>("todos");

  const filtered = plans.filter((plan) => {
    const isIntegration = plan.plan_type === "qbo_r365";
    if (filter === "plataforma") return !isIntegration;
    if (filter === "integracion") return isIntegration;
    return true;
  });

  return (
    <>
      <div className="mb-6 flex items-center gap-2 px-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setFilter(tab)}
            className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
              filter === tab
                ? "border-[var(--gbp-text)] bg-[var(--gbp-text)] text-white shadow-sm"
                : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div className="grid gap-6">
        {filtered.map((plan) => {
          const usedCount = usageByPlanId[plan.id] ?? 0;
          const selectedModuleIds = modulesByPlanId[plan.id] ?? [];
          const selectedSet = new Set(selectedModuleIds);
          const activeModules = moduleCatalogList.filter((m) => selectedSet.has(m.id));
          const isIntegration = plan.plan_type === "qbo_r365";

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
                  <p className="text-sm text-foreground/60 line-clamp-2 italic">
                    {plan.description || "Sin descripción comercial definida."}
                  </p>

                  <div className="flex flex-wrap gap-6 pt-2">
                    {(!isIntegration || plan.stripe_price_id) && (
                      <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                        <BadgeDollarSign className="h-5 w-5 text-brand" />
                        <span>{money(plan.price_amount, plan.currency_code ?? "USD")}</span>
                        <span className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                          / {plan.billing_period}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      <span>
                        {usedCount}{" "}
                        <span className="text-[11px] uppercase tracking-[0.08em] opacity-60">Clientes</span>
                      </span>
                    </div>
                    {plan.stripe_price_id ? (
                      <div
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600"
                        title={`ID: ${plan.stripe_price_id}`}
                      >
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

                {isIntegration ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                      <FileText className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">
                        Facturas incluidas
                      </p>
                      <p className="mt-1 text-lg font-black text-foreground">
                        {plan.invoices_included != null ? String(plan.invoices_included) : "∞"}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                      <BadgeDollarSign className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">
                        Setup Fee
                      </p>
                      <p className="mt-1 text-lg font-black text-foreground">
                        {plan.setup_fee_amount ? money(plan.setup_fee_amount) : "Sin fee"}
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
                    ].map((limit) => (
                      <div key={limit.label} className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                        <limit.icon className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">
                          {limit.label}
                        </p>
                        <p className="mt-1 text-lg font-black text-foreground">{limit.val || "∞"}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col gap-3 lg:w-48">
                  {!isIntegration && (
                    <details className="group/details">
                      <summary className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 text-xs font-bold text-foreground cursor-pointer transition-colors hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)]">
                        <span>{activeModules.length} Módulos</span>
                        <ChevronDown className="h-4 w-4 transition-transform group-open/details:rotate-180" />
                      </summary>
                      <div className="absolute right-6 top-full mt-2 z-50 w-64 rounded-[1.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-2xl backdrop-blur-xl">
                        <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.11em] text-brand">
                          Capacidades del Plan
                        </p>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                          {activeModules.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 text-[11px] font-semibold text-foreground/80"
                            >
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
                      plan_type: plan.plan_type ?? null,
                      is_featured: plan.is_featured ?? null,
                      is_enterprise: plan.is_enterprise ?? null,
                      setup_fee_amount: plan.setup_fee_amount ?? null,
                      setup_fee_annual_discount_pct: plan.setup_fee_annual_discount_pct ?? 25,
                      max_r365_connections: plan.max_r365_connections ?? null,
                      features: plan.features ?? null,
                      cta_text: plan.cta_text ?? null,
                      cta_email: plan.cta_email ?? null,
                      sort_order: plan.sort_order ?? null,
                      invoices_included: plan.invoices_included ?? null,
                    }}
                    modulesCatalog={moduleCatalogList}
                    selectedModuleIds={selectedModuleIds}
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
    </>
  );
}
