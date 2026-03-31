import {
  BadgeDollarSign,
  Building2,
  ChevronDown,
  PencilLine,
  Plus,
  ShieldCheck,
  Zap,
  Layers,
  HardDrive,
  Users2,
  AlertCircle,
  Trash2,
} from "lucide-react";
import * as motion from "framer-motion/client";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  createPlanAction,
  deletePlanAction,
  updatePlanAction,
} from "@/modules/plans/actions";
import { ConfirmSubmitButton } from "@/shared/ui/confirm-submit-button";
import { SuperadminInputField, SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";
import { DetailsCloseButton } from "@/shared/ui/details-close-button";

type SuperadminPlansPageProps = {
  searchParams: Promise<{ status?: string; message?: string; plan?: string }>;
};

function money(amount: number | null, currency = "USD") {
  if (amount === null || amount === undefined) return "Sin precio";
  return new Intl.NumberFormat("es-AR", {
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

  const [
    { data: plans },
    { data: orgsWithPlans },
    { data: modulesCatalog },
    { data: planModules },
  ] = await Promise.all([
    supabase
      .from("plans")
      .select("id, code, name, description, is_active, price_amount, currency_code, billing_period, max_branches, max_users, max_storage_mb, max_employees, stripe_price_id, created_at")
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

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative z-10">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand-light/60">Monetización & Escala</p>
          <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">Planes Maestros</h1>
          <p className="mt-4 max-w-2xl text-base text-white/70 leading-relaxed">
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
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <stat.icon className="h-3.5 w-3.5" /> {stat.label}
            </p>
            <p className={`mt-2 font-serif text-3xl font-medium ${stat.color}`}>{stat.val}</p>
          </motion.article>
        ))}
      </section>

      <section className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm overflow-hidden">
        <div className="mb-8 flex items-center justify-between px-2">
            <div>
               <h2 className="text-xl font-bold tracking-tight text-foreground">Gestión de Oferta Comercial</h2>
               <p className="text-xs text-muted-foreground mt-1">Configure los parámetros de crecimiento y costos operativos.</p>
            </div>
            <details className="relative">
              <summary className="list-none">
                <div className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-3 text-xs font-bold text-white shadow-[var(--gbp-shadow-accent)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:scale-[1.02]">
                  <Plus className="h-4 w-4" /> Nuevo Plan
                </div>
              </summary>
              <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                  <div className="relative z-10 w-full max-w-4xl rounded-[2.5rem] bg-[var(--gbp-surface)] p-8 shadow-2xl border border-[var(--gbp-border)]">
                   <div className="mb-6 flex items-center justify-between border-b border-[var(--gbp-border)] pb-6">
                      <h3 className="text-2xl font-bold text-foreground">Configurar Nueva Propuesta</h3>
                      <DetailsCloseButton />
                   </div>
                   <form action={createPlanAction} className="grid gap-6 md:grid-cols-6 max-h-[70vh] overflow-y-auto pt-2 pr-4 scrollbar-hide">
                      <SuperadminInputField label="Identificador (Slug)" name="code" required placeholder="p.ej: premium-anual" className="md:col-span-2" />
                      <SuperadminInputField label="Nombre Público" name="name" required placeholder="p.ej: Premium" className="md:col-span-2" />
                      <div className="md:col-span-2 grid grid-cols-2 gap-4">
                         <SuperadminInputField label="Precio" name="price_amount" type="number" min="0" step="0.01" placeholder="Dejar en 0 si usa Stripe ID" />
                         <SuperadminInputField label="Moneda" name="currency_code" defaultValue="USD" />
                      </div>
                      <SuperadminInputField label="Descripción Breve" name="description" placeholder="Resumen de beneficios" className="md:col-span-4" />
                      <SuperadminSelectField label="Ciclo de Cobro" name="billing_period" defaultValue="monthly" className="md:col-span-2">
                        <option value="monthly">Mensual</option>
                        <option value="yearly">Anual</option>
                        <option value="one_time">Pago Único</option>
                      </SuperadminSelectField>
                      <SuperadminInputField label="Stripe Price ID" name="stripe_price_id" placeholder="Opcional. ej: price_1Pxxxxxxxx" className="md:col-span-6" />

                      <div className="md:col-span-6 bg-muted/20 rounded-2xl p-6 border border-line/20">
                         <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand mb-6">Restricciones Técnicas (0 = Ilimitado)</p>
                         <div className="grid gap-4 sm:grid-cols-4">
                           <SuperadminInputField label="Sucursales" name="max_branches" type="number" min="0" defaultValue="0" />
                           <SuperadminInputField label="Cant. Usuarios" name="max_users" type="number" min="0" defaultValue="0" />
                           <SuperadminInputField label="Cant. Empleados" name="max_employees" type="number" min="0" defaultValue="0" />
                           <SuperadminInputField label="Storage (MB)" name="max_storage_mb" type="number" min="0" defaultValue="0" />
                         </div>
                      </div>

                      <div className="md:col-span-6 rounded-2xl border border-[var(--gbp-border)] p-6">
                        <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--gbp-text2)]">Infraestructura de Módulos Incluidos</p>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {(modulesCatalog ?? []).map((module) => (
                            <label key={module.id} className="group flex cursor-pointer items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 transition-all hover:bg-[var(--gbp-surface)] hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)]">
                              <span className="text-sm font-bold text-foreground/80">
                                {module.name}
                                {module.is_core && <span className="ml-2 text-[9px] uppercase tracking-tighter text-brand">Core</span>}
                              </span>
                              <input
                                type="checkbox"
                                name="module_ids"
                                value={module.id}
                                defaultChecked={module.is_core}
                                disabled={module.is_core}
                                className="h-5 w-5 rounded-lg accent-brand"
                              />
                            </label>
                          ))}
                        </div>
                      </div>

                       <div className="md:col-span-6 flex items-center justify-between border-t border-[var(--gbp-border)] pt-6">
                        <label className="flex items-center gap-3 cursor-pointer">
                           <input type="checkbox" name="is_active" defaultChecked className="h-6 w-11 rounded-full accent-brand" />
                           <span className="text-sm font-bold text-foreground">Publicar Inmediatamente</span>
                        </label>
                        <div className="flex gap-3">
                           <DetailsCloseButton className="rounded-xl border border-[var(--gbp-border)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)]">
                             Cancelar
                           </DetailsCloseButton>
                           <button type="submit" className="rounded-xl bg-[var(--gbp-accent)] px-10 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)]">Registrar Plan</button>
                        </div>
                      </div>
                   </form>
                 </div>
              </div>
            </details>
        </div>

        <div className="grid gap-6">
          {(plans ?? []).map((plan) => {
            const usedCount = usageMap.get(plan.id) ?? 0;
            const selectedSet = planModuleMap.get(plan.id) ?? new Set<string>();
            const activeModules = (modulesCatalog ?? []).filter(m => selectedSet.has(m.id));

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
                          <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${plan.is_active ? 'bg-brand/5 text-brand' : 'bg-muted text-muted-foreground'}`}>
                             <Zap className="h-6 w-6" />
                          </div>
                          <div>
                             <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                             <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">{plan.code}</p>
                          </div>
                       </div>
                       <span className={`rounded-xl border px-3 py-1 text-[11px] font-black uppercase tracking-tighter ${plan.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-line bg-muted/20 text-muted-foreground'}`}>
                          {plan.is_active ? 'Status: Publicado' : 'Status: Borrador'}
                       </span>
                    </div>
                    <p className="text-sm text-foreground/60 line-clamp-2 italic">{plan.description || 'Sin descripción comercial definida.'}</p>
                    
                    <div className="flex flex-wrap gap-6 pt-2">
                       <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <BadgeDollarSign className="h-5 w-5 text-brand" />
                          <span>{money(plan.price_amount, plan.currency_code ?? "USD")}</span>
                          <span className="text-[10px] uppercase text-muted-foreground font-normal">/ {plan.billing_period}</span>
                       </div>
                       <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <span>{usedCount} <span className="text-[10px] font-normal uppercase opacity-60">Clientes</span></span>
                       </div>
                       {plan.stripe_price_id ? (
                         <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-600" title={`ID: ${plan.stripe_price_id}`}>
                           <BadgeDollarSign className="h-4 w-4" />
                           <span className="font-bold">Enlazado a Stripe</span>
                         </div>
                       ) : (
                         <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-500">
                           <AlertCircle className="h-4 w-4" />
                           <span>Sin vincular a Stripe</span>
                         </div>
                       )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                     {[
                       { label: 'Sucursales', val: plan.max_branches, icon: Building2 },
                       { label: 'Usuarios', val: plan.max_users, icon: Users2 },
                       { label: 'Empleados', val: plan.max_employees, icon: Layers },
                       { label: 'Storage (MB)', val: plan.max_storage_mb, icon: HardDrive },
                     ].map(limit => (
                        <div key={limit.label} className="rounded-2xl border border-line/20 bg-muted/10 p-4 text-center">
                           <limit.icon className="mx-auto mb-2 h-4 w-4 text-muted-foreground opacity-40" />
                           <p className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground/60">{limit.label}</p>
                           <p className="mt-1 text-lg font-black text-foreground">{limit.val || '∞'}</p>
                        </div>
                     ))}
                  </div>

                  <div className="flex flex-col gap-3 lg:w-48">
                       <details className="group/details">
                        <summary className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 text-xs font-bold text-foreground cursor-pointer transition-colors hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)]">
                          <span>{activeModules.length} Módulos</span>
                          <ChevronDown className="h-4 w-4 transition-transform group-open/details:rotate-180" />
                       </summary>
                        <div className="absolute right-6 top-full mt-2 z-50 w-64 rounded-[1.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-2xl backdrop-blur-xl">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">Capacidades del Plan</p>
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-hide">
                            {activeModules.map(m => (
                               <div key={m.id} className="flex items-center gap-2 text-[11px] font-medium text-foreground/80">
                                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  {m.name}
                               </div>
                            ))}
                          </div>
                       </div>
                    </details>
                    
                    <details className="group/edit">
                        <summary className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700 cursor-pointer hover:bg-amber-100">
                          <PencilLine className="h-4 w-4" /> Editar Plan
                       </summary>
                       <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
                          <div className="relative z-10 w-full max-w-4xl rounded-[2.5rem] bg-[var(--gbp-surface)] p-8 shadow-2xl border border-[var(--gbp-border)]">
                             <div className="mb-6 flex items-center justify-between border-b border-[var(--gbp-border)] pb-6">
                               <h3 className="text-2xl font-bold text-foreground">Ajustar Propuesta Comercial</h3>
                               <DetailsCloseButton />
                            </div>
                            <form action={updatePlanAction} className="grid gap-6 md:grid-cols-6 max-h-[70vh] overflow-y-auto pt-2 pr-4 scrollbar-hide">
                               <input type="hidden" name="plan_id" value={plan.id} />
                               <SuperadminInputField label="Nombre Público" name="name" defaultValue={plan.name} className="md:col-span-3" />
                               <div className="md:col-span-3 grid grid-cols-2 gap-4">
                                  <SuperadminInputField label="Precio" name="price_amount" type="number" min="0" step="0.01" defaultValue={plan.price_amount ?? ""} placeholder="Auto si hay Stripe ID" />
                                  <SuperadminInputField label="Moneda" name="currency_code" defaultValue={plan.currency_code ?? "USD"} />
                               </div>
                               <SuperadminInputField label="Descripción" name="description" defaultValue={plan.description ?? ""} className="md:col-span-4" />
                               <SuperadminSelectField label="Ciclo" name="billing_period" defaultValue={plan.billing_period ?? "monthly"} className="md:col-span-2">
                                 <option value="monthly">Mensual</option>
                                 <option value="yearly">Anual</option>
                                 <option value="one_time">Pago Único</option>
                               </SuperadminSelectField>

                       <SuperadminInputField label="Stripe Price ID" name="stripe_price_id" defaultValue={plan.stripe_price_id ?? ""} placeholder="price_1Pxxxxxxxx" className="md:col-span-6" />
                               
                               <div className="md:col-span-6 bg-muted/20 rounded-2xl p-6">
                                  <div className="grid gap-4 sm:grid-cols-4">
                                    <SuperadminInputField label="Sucursales" name="max_branches" type="number" min="0" defaultValue={plan.max_branches ?? "0"} />
                                    <SuperadminInputField label="Cant. Usuarios" name="max_users" type="number" min="0" defaultValue={plan.max_users ?? "0"} />
                                    <SuperadminInputField label="Cant. Empleados" name="max_employees" type="number" min="0" defaultValue={plan.max_employees ?? "0"} />
                                    <SuperadminInputField label="Storage (MB)" name="max_storage_mb" type="number" min="0" defaultValue={plan.max_storage_mb ?? "0"} />
                                  </div>
                               </div>

                                <div className="md:col-span-6 rounded-2xl border border-[var(--gbp-border)] p-6 bg-[var(--gbp-bg)]">
                                 <p className="mb-4 text-xs font-bold uppercase tracking-widest text-foreground">Matriz de Módulos Activos</p>
                                 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                   {(modulesCatalog ?? []).map((module) => {
                                      const isChecked = selectedSet.has(module.id);
                                      return (
                                         <label key={module.id} className="group flex cursor-pointer items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-3 hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)]">
                                          <span className="text-sm font-bold text-foreground/80">
                                            {module.name}
                                            {module.is_core && <span className="ml-2 text-[9px] uppercase tracking-tighter text-brand">Core</span>}
                                          </span>
                                          <input
                                            type="checkbox"
                                            name="module_ids"
                                            value={module.id}
                                            defaultChecked={isChecked || module.is_core}
                                            disabled={module.is_core}
                                            className="h-5 w-5 rounded-lg accent-brand"
                                          />
                                        </label>
                                      );
                                   })}
                                 </div>
                               </div>

                                <div className="md:col-span-6 flex items-center justify-between border-t border-[var(--gbp-border)] pt-6">
                                 <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="h-6 w-11 rounded-full accent-brand" />
                                    <span className="text-sm font-bold text-foreground">Estado del Plan (Habilitado)</span>
                                 </label>
                                 <div className="flex gap-3">
                                     <DetailsCloseButton className="rounded-xl border border-[var(--gbp-border)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)]">
                                      Cancelar
                                    </DetailsCloseButton>
                                    <button type="submit" className="rounded-xl bg-foreground px-10 py-2.5 text-sm font-bold text-white shadow-lg shadow-black/10">Sincronizar Cambios</button>
                                 </div>
                               </div>
                            </form>
                          </div>
                       </div>
                    </details>

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
                            ? 'bg-muted/50 text-muted-foreground cursor-not-allowed border border-line/20' 
                            : 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'
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
    </main>
  );
}
