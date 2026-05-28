"use client";

import { useState, useCallback } from "react";
import {
  X,
  Plus,
  PencilLine,
  Zap,
  Cpu,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import {
  SuperadminInputField,
  SuperadminSelectField,
} from "@/shared/ui/superadmin-form-fields";

type Module = { id: string; name: string; is_core: boolean };

type PlanData = {
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
  max_employees: number | null;
  max_storage_mb: number | null;
  stripe_price_id: string | null;
  plan_type: string | null;
  is_featured: boolean | null;
  is_enterprise: boolean | null;
  setup_fee_amount: number | null;
  features: unknown;
  cta_text: string | null;
  cta_email: string | null;
  sort_order: number | null;
  invoices_included: number | null;
};

type PriceState = {
  loading: boolean;
  preview: { amount: number; currency: string; type: string; interval: string | null } | null;
  error: string | null;
};

type Props = {
  mode: "create" | "edit";
  formAction: (formData: FormData) => Promise<void>;
  plan?: PlanData | null;
  modulesCatalog: Module[];
  selectedModuleIds: string[];
};

async function resolvePrice(
  priceId: string,
): Promise<{ data: PriceState["preview"]; error: string | null }> {
  if (!priceId.trim()) return { data: null, error: null };
  try {
    const res = await fetch(
      `/api/stripe/resolve-price?priceId=${encodeURIComponent(priceId)}`,
    );
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.error ?? "Price ID inválido" };
    return { data: json, error: null };
  } catch {
    return { data: null, error: "No se pudo conectar con Stripe" };
  }
}

function fmtPrice(p: NonNullable<PriceState["preview"]>) {
  const n = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: p.currency,
    minimumFractionDigits: 0,
  }).format(p.amount);
  if (p.type === "recurring" && p.interval) return `${n} / ${p.interval}`;
  return `${n} (pago único)`;
}

function PriceHint({ state }: { state: PriceState }) {
  if (state.loading)
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Consultando Stripe…
      </p>
    );
  if (state.error)
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-rose-500">
        <AlertCircle className="h-3 w-3" /> {state.error}
      </p>
    );
  if (state.preview)
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
        <CheckCircle2 className="h-3 w-3" /> {fmtPrice(state.preview)}
      </p>
    );
  return null;
}

export function PlanFormModal({
  mode,
  formAction,
  plan,
  modulesCatalog,
  selectedModuleIds,
}: Props) {
  const [open, setOpen] = useState(false);
  const [planType, setPlanType] = useState<"platform" | "integration">(
    plan?.plan_type === "qbo_r365" ? "integration" : "platform",
  );

  const [mainPrice, setMainPrice] = useState<PriceState>({
    loading: false,
    preview: null,
    error: null,
  });
  const [setupFeePrice, setSetupFeePrice] = useState<PriceState>({
    loading: false,
    preview: null,
    error: null,
  });
  const [setupFeeAmount, setSetupFeeAmount] = useState(
    plan?.setup_fee_amount != null ? String(plan.setup_fee_amount) : "",
  );

  const selectedSet = new Set(selectedModuleIds);

  const handleMainPriceBlur = useCallback(
    async (e: React.FocusEvent<HTMLInputElement>) => {
      const priceId = e.target.value.trim();
      if (!priceId) {
        setMainPrice({ loading: false, preview: null, error: null });
        return;
      }
      setMainPrice({ loading: true, preview: null, error: null });
      const { data, error } = await resolvePrice(priceId);
      setMainPrice({ loading: false, preview: data, error });
    },
    [],
  );

  const handleSetupFeePriceBlur = useCallback(
    async (e: React.FocusEvent<HTMLInputElement>) => {
      const priceId = e.target.value.trim();
      if (!priceId) {
        setSetupFeePrice({ loading: false, preview: null, error: null });
        return;
      }
      setSetupFeePrice({ loading: true, preview: null, error: null });
      const { data, error } = await resolvePrice(priceId);
      setSetupFeePrice({ loading: false, preview: data, error });
      if (data) setSetupFeeAmount(String(data.amount));
    },
    [],
  );

  return (
    <>
      {/* ── Trigger ─────────────────────────────────────────────── */}
      {mode === "create" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-3 text-xs font-bold text-white shadow-[var(--gbp-shadow-accent)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:scale-[1.02]"
        >
          <Plus className="h-4 w-4" /> Nuevo Plan
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
        >
          <PencilLine className="h-4 w-4" /> Editar Plan
        </button>
      )}

      {/* ── Modal ───────────────────────────────────────────────── */}
      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="relative z-10 w-full max-w-4xl rounded-[2.5rem] bg-[var(--gbp-surface)] p-8 shadow-2xl border border-[var(--gbp-border)]">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between border-b border-[var(--gbp-border)] pb-6">
              <h3 className="text-2xl font-bold text-foreground">
                {mode === "create"
                  ? "Configurar Nueva Propuesta"
                  : "Ajustar Propuesta Comercial"}
              </h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              action={formAction}
              className="max-h-[70vh] space-y-6 overflow-y-auto pr-4 scrollbar-hide"
            >
              {mode === "edit" && plan && (
                <input type="hidden" name="plan_id" value={plan.id} />
              )}
              <input
                type="hidden"
                name="plan_type"
                value={planType === "integration" ? "qbo_r365" : "platform"}
              />

              {/* ── Plan type toggle ─────────────────────────── */}
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Tipo de Plan
                </p>
                <div className="inline-flex gap-1 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-1">
                  {(
                    [
                      { value: "platform" as const, label: "Plataforma SaaS", Icon: Zap },
                      { value: "integration" as const, label: "Integración", Icon: Cpu },
                    ] as const
                  ).map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPlanType(value)}
                      className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
                        planType === value
                          ? "bg-[var(--gbp-text)] text-white shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Platform fields ──────────────────────────── */}
              {planType === "platform" && (
                <>
                  <div className="grid gap-4 md:grid-cols-6">
                    {mode === "create" && (
                      <SuperadminInputField
                        label="Identificador (Slug)"
                        name="code"
                        required
                        placeholder="p.ej: premium-anual"
                        className="md:col-span-2"
                      />
                    )}
                    <SuperadminInputField
                      label="Nombre Público"
                      name="name"
                      required
                      defaultValue={plan?.name ?? ""}
                      placeholder="p.ej: Premium"
                      className={mode === "create" ? "md:col-span-2" : "md:col-span-3"}
                    />
                    <div
                      className={`grid grid-cols-2 gap-4 ${mode === "create" ? "md:col-span-2" : "md:col-span-3"}`}
                    >
                      <SuperadminInputField
                        label="Precio"
                        name="price_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={plan?.price_amount ?? ""}
                        placeholder="0"
                      />
                      <SuperadminInputField
                        label="Moneda"
                        name="currency_code"
                        defaultValue={plan?.currency_code ?? "USD"}
                      />
                    </div>
                    <SuperadminInputField
                      label="Descripción Breve"
                      name="description"
                      defaultValue={plan?.description ?? ""}
                      placeholder="Resumen de beneficios"
                      className="md:col-span-4"
                    />
                    <SuperadminSelectField
                      label="Ciclo de Cobro"
                      name="billing_period"
                      defaultValue={plan?.billing_period ?? "monthly"}
                      className="md:col-span-2"
                    >
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                      <option value="one_time">Pago Único</option>
                    </SuperadminSelectField>
                    <SuperadminInputField
                      label="Stripe Price ID"
                      name="stripe_price_id"
                      defaultValue={plan?.stripe_price_id ?? ""}
                      placeholder="Opcional. ej: price_1Pxxxxxxxx"
                      className="md:col-span-6"
                    />
                  </div>

                  <div className="rounded-2xl border border-[var(--gbp-border)] bg-muted/20 p-6">
                    <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">
                      Restricciones Técnicas (0 = Ilimitado)
                    </p>
                    <div className="grid gap-4 sm:grid-cols-4">
                      <SuperadminInputField
                        label="Locaciones"
                        name="max_branches"
                        type="number"
                        min="0"
                        defaultValue={plan?.max_branches ?? "0"}
                      />
                      <SuperadminInputField
                        label="Cant. Usuarios"
                        name="max_users"
                        type="number"
                        min="0"
                        defaultValue={plan?.max_users ?? "0"}
                      />
                      <SuperadminInputField
                        label="Cant. Empleados"
                        name="max_employees"
                        type="number"
                        min="0"
                        defaultValue={plan?.max_employees ?? "0"}
                      />
                      <SuperadminInputField
                        label="Storage (MB)"
                        name="max_storage_mb"
                        type="number"
                        min="0"
                        defaultValue={plan?.max_storage_mb ?? "0"}
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--gbp-border)] p-6">
                    <p className="mb-4 text-xs font-bold uppercase tracking-widest text-[var(--gbp-text2)]">
                      Infraestructura de Módulos Incluidos
                    </p>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {modulesCatalog.map((module) => (
                        <label
                          key={module.id}
                          className="group flex cursor-pointer items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 transition-all hover:bg-[var(--gbp-surface)] hover:border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)]"
                        >
                          <span className="text-sm font-bold text-foreground/80">
                            {module.name}
                            {module.is_core && (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-brand">
                                Core
                              </span>
                            )}
                          </span>
                          <input
                            type="checkbox"
                            name="module_ids"
                            value={module.id}
                            defaultChecked={selectedSet.has(module.id) || module.is_core}
                            disabled={module.is_core}
                            className="h-5 w-5 rounded-lg accent-brand"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── Integration fields ───────────────────────── */}
              {planType === "integration" && (
                <>
                  {/* Slug / Name / Sort order */}
                  <div className="grid gap-4 md:grid-cols-6">
                    {mode === "create" && (
                      <SuperadminInputField
                        label="Identificador (Slug)"
                        name="code"
                        required
                        placeholder="p.ej: qbo-r365-connect"
                        className="md:col-span-2"
                      />
                    )}
                    <SuperadminInputField
                      label="Nombre del Plan"
                      name="name"
                      required
                      defaultValue={plan?.name ?? ""}
                      placeholder="p.ej: Connect"
                      className={mode === "create" ? "md:col-span-2" : "md:col-span-3"}
                    />
                    <SuperadminSelectField
                      label="Ciclo de Cobro"
                      name="billing_period"
                      defaultValue={plan?.billing_period ?? "monthly"}
                      className={mode === "create" ? "md:col-span-1" : "md:col-span-2"}
                    >
                      <option value="monthly">Mensual</option>
                      <option value="yearly">Anual</option>
                    </SuperadminSelectField>
                    <SuperadminInputField
                      label="Orden en landing"
                      name="sort_order"
                      type="number"
                      min="0"
                      defaultValue={plan?.sort_order ?? "0"}
                      className={mode === "create" ? "md:col-span-1" : "md:col-span-1"}
                    />
                  </div>

                  <SuperadminInputField
                    label="Descripción breve"
                    name="description"
                    defaultValue={plan?.description ?? ""}
                    placeholder="Resumen del plan para la landing"
                  />

                  {/* Main Stripe Price ID */}
                  <div>
                    <SuperadminInputField
                      label="Stripe Price ID (precio recurrente)"
                      name="stripe_price_id"
                      required
                      defaultValue={plan?.stripe_price_id ?? ""}
                      placeholder="price_1Pxxxxxxxx"
                      onBlur={handleMainPriceBlur}
                    />
                    <PriceHint state={mainPrice} />
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      El monto se resolverá automáticamente desde Stripe al guardar.
                    </p>
                  </div>

                  {/* Setup Fee */}
                  <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-5">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      Setup Fee <span className="normal-case font-normal">(opcional)</span>
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <SuperadminInputField
                          label="Stripe Price ID del Setup Fee"
                          name="setup_fee_stripe_price_id"
                          defaultValue=""
                          placeholder="price_setup_xxx — vacío si no aplica"
                          onBlur={handleSetupFeePriceBlur}
                        />
                        <PriceHint state={setupFeePrice} />
                      </div>
                      <div>
                        <SuperadminInputField
                          label="Monto del Setup Fee ($)"
                          name="setup_fee_amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={setupFeeAmount}
                          onChange={(e) => setSetupFeeAmount(e.target.value)}
                          placeholder="0"
                        />
                        <p className="mt-1 text-[11px] text-muted-foreground/60">
                          {setupFeePrice.preview
                            ? "Auto-completado desde Stripe. Ajustable manualmente."
                            : "Ingresa el Price ID arriba para auto-completar, o escribe el monto."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Invoices + CTA */}
                  <div className="grid gap-4 sm:grid-cols-3">
                    <SuperadminInputField
                      label="Facturas incluidas en el plan"
                      name="invoices_included"
                      type="number"
                      min="0"
                      defaultValue={plan?.invoices_included ?? ""}
                      placeholder="p.ej: 500"
                    />
                    <SuperadminInputField
                      label="Texto del botón CTA"
                      name="cta_text"
                      defaultValue={plan?.cta_text ?? ""}
                      placeholder="p.ej: Get Started"
                    />
                    <SuperadminInputField
                      label="Email CTA (Enterprise)"
                      name="cta_email"
                      type="email"
                      defaultValue={plan?.cta_email ?? ""}
                      placeholder="p.ej: sales@example.com"
                    />
                  </div>

                  {/* Flags */}
                  <div className="flex flex-wrap gap-6">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        name="is_featured"
                        defaultChecked={plan?.is_featured ?? false}
                        className="h-4 w-4 rounded accent-violet-600"
                      />
                      <span className="text-xs font-semibold text-foreground">
                        Tarjeta destacada (fondo oscuro)
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        name="is_enterprise"
                        defaultChecked={plan?.is_enterprise ?? false}
                        className="h-4 w-4 rounded accent-violet-600"
                      />
                      <span className="text-xs font-semibold text-foreground">
                        Enterprise (sin precio, borde punteado)
                      </span>
                    </label>
                  </div>

                  {/* Features JSON */}
                  <div>
                    <label className="block text-xs font-semibold text-foreground/70 mb-1.5">
                      Features (JSON array)
                    </label>
                    <textarea
                      name="features"
                      rows={5}
                      defaultValue={
                        plan?.features ? JSON.stringify(plan.features, null, 2) : ""
                      }
                      placeholder={`[\n  {"text": "Hasta 500 facturas/mes", "highlight": false},\n  {"text": "Sincronización diaria", "highlight": true}\n]`}
                      className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                    />
                  </div>

                  {/* Unused platform fields sent as neutral values */}
                  <input type="hidden" name="max_branches" value="0" />
                  <input type="hidden" name="max_users" value="0" />
                  <input type="hidden" name="max_employees" value="0" />
                  <input type="hidden" name="max_storage_mb" value="0" />
                </>
              )}

              {/* ── Footer ───────────────────────────────────── */}
              <div className="flex items-center justify-between border-t border-[var(--gbp-border)] pt-6">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked={plan?.is_active ?? true}
                    className="h-6 w-11 rounded-full accent-brand"
                  />
                  <span className="text-sm font-bold text-foreground">
                    {mode === "create" ? "Publicar Inmediatamente" : "Estado del Plan (Habilitado)"}
                  </span>
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-[var(--gbp-border)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-[var(--gbp-accent)] px-10 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)]"
                  >
                    {mode === "create" ? "Registrar Plan" : "Sincronizar Cambios"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
