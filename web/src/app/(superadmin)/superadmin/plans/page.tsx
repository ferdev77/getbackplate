import {
  BadgeDollarSign,
  Building2,
  CalendarClock,
  ChevronDown,
  PencilLine,
  Plus,
  ShieldCheck,
} from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  createPlanAction,
  deletePlanAction,
  updatePlanAction,
} from "@/modules/plans/actions";
import { ConfirmSubmitButton } from "@/shared/ui/confirm-submit-button";
import { SuperadminInputField, SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";

type SuperadminPlansPageProps = {
  searchParams: Promise<{ status?: string; message?: string }>;
};

function money(amount: number | null, currency = "USD") {
  if (amount === null || amount === undefined) return "Sin precio";
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export default async function SuperadminPlansPage({ searchParams }: SuperadminPlansPageProps) {
  const supabase = createSupabaseAdminClient();
  const params = await searchParams;
  const status = params.status;
  const message = params.message;

  const [
    { data: plans, error: plansError },
    { data: orgPlans, count: organizationsUsingPlans },
    { data: modulesCatalog },
    { data: planModules },
  ] =
    await Promise.all([
      supabase
        .from("plans")
        .select(
          "id, code, name, description, is_active, price_amount, currency_code, billing_period, max_branches, max_users, max_storage_mb, max_employees, created_at",
        )
        .order("name"),
      supabase
        .from("organizations")
        .select("plan_id", { count: "exact" })
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
  for (const row of orgPlans ?? []) {
    const key = row.plan_id as string;
    usageMap.set(key, (usageMap.get(key) ?? 0) + 1);
  }

  const planModuleMap = new Map<string, Set<string>>();
  for (const row of planModules ?? []) {
    const existing = planModuleMap.get(row.plan_id) ?? new Set<string>();
    existing.add(row.module_id);
    planModuleMap.set(row.plan_id, existing);
  }

  const plansErrorMessage = plansError
    ? plansError.message.includes("Could not find the table 'public.plans'")
      ? "No existe la tabla plans en la base. Ejecuta migraciones: 20260311_0001_base_saas.sql y luego 202603110002_plan_pricing.sql."
      : plansError.message
    : null;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6">
        <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[#9c938d] uppercase">Superadmin</p>
        <h1 className="mb-1 text-2xl font-bold tracking-tight text-[#241f1c]">Planes comerciales</h1>
        <p className="text-sm text-[#6b635e]">
          Gestiona precio, periodo y estado de cada plan con una vista compacta y profesional.
        </p>
      </section>

      {message ? (
        <section
          className={`rounded-xl border px-4 py-3 text-sm ${
            status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {message}
        </section>
      ) : null}

      {plansErrorMessage ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          No se pudieron cargar los planes: {plansErrorMessage}
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-[#e5ddd8] bg-white p-4">
          <p className="text-xs text-[#8d847f]">Planes cargados</p>
          <p className="mt-1 text-2xl font-bold text-[#251f1b]">{plans?.length ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#e5ddd8] bg-white p-4">
          <p className="text-xs text-[#8d847f]">Empresas con plan</p>
          <p className="mt-1 text-2xl font-bold text-[#251f1b]">{organizationsUsingPlans ?? 0}</p>
        </article>
        <article className="rounded-xl border border-[#e5ddd8] bg-white p-4">
          <p className="text-xs text-[#8d847f]">Planes activos</p>
          <p className="mt-1 text-2xl font-bold text-[#251f1b]">{(plans ?? []).filter((p) => p.is_active).length}</p>
        </article>
      </section>

      <details className="group rounded-2xl border border-[#e5ddd8] bg-white p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-[#e6ddd8] bg-[#fffdfa] px-4 py-3 hover:bg-[#faf6f4]">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[#f2cdc6] bg-[#fff1ef] text-[#b63a2f]">
              <Plus className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#2b2521] sm:text-base">Agregar nuevo plan</p>
              <p className="text-xs text-[#7b726d] sm:text-sm">Carga datos comerciales y define el periodo de cobro.</p>
            </div>
          </div>
          <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
        </summary>

        <form action={createPlanAction} className="mt-4 grid gap-3 md:grid-cols-6">
          <SuperadminInputField label="Code" name="code" required spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="growth" />
          <SuperadminInputField label="Nombre" name="name" required spellCheck={false} autoCorrect="off" placeholder="Nombre" />
          <SuperadminInputField label="Descripcion" name="description" placeholder="Descripcion" className="md:col-span-2" />
          <SuperadminInputField label="Precio" name="price_amount" type="number" min="0" step="0.01" placeholder="0.00" />
          <SuperadminInputField label="Moneda" name="currency_code" defaultValue="USD" placeholder="USD" />
          <SuperadminSelectField label="Periodo" name="billing_period" defaultValue="monthly">
            <option value="monthly">Mensual</option>
            <option value="yearly">Anual</option>
            <option value="one_time">Unico pago</option>
            <option value="custom">Custom</option>
          </SuperadminSelectField>
          <SuperadminInputField label="Max sucursales" name="max_branches" type="number" min="0" placeholder="Ej: 10" />
          <SuperadminInputField label="Max usuarios" name="max_users" type="number" min="0" placeholder="Ej: 25" />
          <SuperadminInputField label="Max empleados" name="max_employees" type="number" min="0" placeholder="Ej: 80" />
          <SuperadminInputField label="Max storage MB" name="max_storage_mb" type="number" min="0" placeholder="Ej: 500" />
          <div className="md:col-span-6 rounded-xl border border-[#eee6e1] bg-[#fffdfa] p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#7a706a]">Modulos incluidos en el plan</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(modulesCatalog ?? []).map((module) => (
                <label key={module.id} className="inline-flex items-center gap-2 text-sm text-[#4f4843]">
                  <input
                    type="checkbox"
                    name="module_ids"
                    value={module.id}
                    defaultChecked={module.is_core}
                    disabled={module.is_core}
                    className="h-4 w-4"
                  />
                  <span>
                    {module.name}
                    {module.is_core ? " (core)" : ""}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-[#7f756f]">Los modulos core siempre se incluyen y no pueden desmarcarse.</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-[#4f4843]">
            <input type="checkbox" name="is_active" defaultChecked className="h-4 w-4" /> Activo
          </label>
          <button type="submit" className="rounded-lg bg-[#b63a2f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#8f2e26] md:w-fit">
            Crear plan
          </button>
        </form>
      </details>

      <section className="space-y-3">
        {(plans ?? []).map((plan) => {
          const usedBy = usageMap.get(plan.id) ?? 0;
          const selectedModules = planModuleMap.get(plan.id) ?? new Set<string>();
          const includedModules = (modulesCatalog ?? []).filter((module) => selectedModules.has(module.id));

          return (
            <details key={plan.id} className="group rounded-2xl border border-[#e5ddd8] bg-white p-4" open={plan.code === "starter"}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div className="grid flex-1 gap-3 sm:grid-cols-[1.6fr_1fr_1fr_1fr] sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-[#2a2420]">{plan.name}</p>
                    <p className="truncate text-xs text-[#837a75]">{plan.code}</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-[#4f4843]">
                    <BadgeDollarSign className="h-4 w-4 text-[#b63a2f]" />
                    <span>{money(plan.price_amount, plan.currency_code ?? "USD")}</span>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-[#4f4843]">
                    <Building2 className="h-4 w-4 text-[#5e5752]" />
                    <span>{usedBy} empresas</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[#e6ddd8] bg-[#faf6f4] px-2 py-0.5 text-xs text-[#5f5752]">
                      <CalendarClock className="h-3.5 w-3.5" /> {plan.billing_period ?? "monthly"}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${plan.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>
                      <ShieldCheck className="h-3.5 w-3.5" /> {plan.is_active ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-[#7a706a]">
                  <span className="rounded-full border border-[#e8ded8] bg-[#faf6f4] px-2 py-0.5">Suc: {plan.max_branches ?? "-"}</span>
                  <span className="rounded-full border border-[#e8ded8] bg-[#faf6f4] px-2 py-0.5">Usr: {plan.max_users ?? "-"}</span>
                  <span className="rounded-full border border-[#e8ded8] bg-[#faf6f4] px-2 py-0.5">Emp: {plan.max_employees ?? "-"}</span>
                  <span className="rounded-full border border-[#e8ded8] bg-[#faf6f4] px-2 py-0.5">Storage: {plan.max_storage_mb ?? "-"} MB</span>
                  <span className="rounded-full border border-[#e8ded8] bg-[#faf6f4] px-2 py-0.5">Modulos: {includedModules.length}</span>
                </div>
                <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
              </summary>

              <div className="mt-4 border-t border-[#eee6e1] pt-4">
                <form action={updatePlanAction} className="grid gap-2 md:grid-cols-6">
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <SuperadminInputField label="Nombre" name="name" defaultValue={plan.name} spellCheck={false} autoCorrect="off" />
                  <SuperadminInputField label="Descripcion" name="description" defaultValue={plan.description ?? ""} className="md:col-span-2" />
                  <SuperadminInputField label="Precio" name="price_amount" type="number" min="0" step="0.01" defaultValue={plan.price_amount ?? ""} />
                  <SuperadminInputField label="Moneda" name="currency_code" defaultValue={plan.currency_code ?? "USD"} />
                  <SuperadminSelectField label="Periodo" name="billing_period" defaultValue={plan.billing_period ?? "monthly"}>
                    <option value="monthly">Mensual</option>
                    <option value="yearly">Anual</option>
                    <option value="one_time">Unico pago</option>
                    <option value="custom">Custom</option>
                  </SuperadminSelectField>
                  <SuperadminInputField label="Max sucursales" name="max_branches" type="number" min="0" defaultValue={plan.max_branches ?? ""} placeholder="Ej: 10" />
                  <SuperadminInputField label="Max usuarios" name="max_users" type="number" min="0" defaultValue={plan.max_users ?? ""} placeholder="Ej: 25" />
                  <SuperadminInputField label="Max empleados" name="max_employees" type="number" min="0" defaultValue={plan.max_employees ?? ""} placeholder="Ej: 80" />
                  <SuperadminInputField label="Max storage MB" name="max_storage_mb" type="number" min="0" defaultValue={plan.max_storage_mb ?? ""} placeholder="Ej: 500" />
                  <div className="md:col-span-6 rounded-xl border border-[#eee6e1] bg-[#fffdfa] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-[#7a706a]">Modulos del plan</p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {(modulesCatalog ?? []).map((module) => {
                        const checked = selectedModules.has(module.id);
                        return (
                          <label key={module.id} className="inline-flex items-center gap-2 text-sm text-[#4f4843]">
                            <input
                              type="checkbox"
                              name="module_ids"
                              value={module.id}
                              defaultChecked={checked || module.is_core}
                              disabled={module.is_core}
                              className="h-4 w-4"
                            />
                            <span>
                              {module.name}
                              {module.is_core ? " (core)" : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-xs text-[#7f756f]">Los modulos core se mantienen incluidos automaticamente.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-[#4f4843]">
                    <input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="h-4 w-4" /> Activo
                  </label>
                  <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm text-[#4f4843] hover:bg-[#f8f3f1] md:w-fit">
                    <PencilLine className="h-4 w-4" /> Guardar cambios
                  </button>
                </form>

                <form action={deletePlanAction} className="mt-3">
                  <input type="hidden" name="plan_id" value={plan.id} />
                  <ConfirmSubmitButton
                    label={usedBy > 0 ? "No se puede borrar (en uso)" : "Borrar plan"}
                    disabled={usedBy > 0}
                    confirmTitle="Confirmar eliminacion de plan"
                    confirmDescription={`Se eliminara el plan ${plan.name}. Esta accion no se puede deshacer.`}
                    confirmLabel="Si, borrar"
                    className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm ${
                      usedBy > 0
                        ? "cursor-not-allowed border border-neutral-200 bg-neutral-100 text-neutral-400"
                        : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
                  />
                </form>
              </div>
            </details>
          );
        })}
      </section>

      <section className="rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-4 text-sm text-[#6d645f]">
        <p className="mb-1 font-semibold text-[#2f2925]">Politica de eliminacion</p>
        <p>
          Para proteger integridad de datos, un plan no se borra si tiene empresas
          asignadas. Primero debes reasignarlas a otro plan o dejarlas sin plan.
        </p>
      </section>
    </main>
  );
}
