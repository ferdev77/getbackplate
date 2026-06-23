"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Copy, CheckCheck, Loader2, Link2, Building2, Plug, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";

type Org = { id: string; name: string };
type Plan = { id: string; name: string; setupFeeAmount: number | null };
type PlanKind = "platform" | "integration";
type BillingPeriod = "monthly" | "yearly";

type Props = {
  organizations: Org[];
  platformPlans: Plan[];
  integrationPlans: Plan[];
};

export function SubscriptionLinkModal({ organizations, platformPlans, integrationPlans }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [upgraded, setUpgraded] = useState(false);

  const [orgId, setOrgId] = useState("");
  const [planKind, setPlanKind] = useState<PlanKind>("integration");
  const [planId, setPlanId] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const [includeSetupFee, setIncludeSetupFee] = useState(true);
  const [copied, setCopied] = useState(false);

  const plans = planKind === "integration" ? integrationPlans : platformPlans;
  const selectedOrg = organizations.find((o) => o.id === orgId);
  const selectedPlan = plans.find((p) => p.id === planId);
  const canChargeSetupFee = planKind === "integration" && !!selectedPlan?.setupFeeAmount;

  function reset() {
    setOrgId(""); setPlanKind("integration"); setPlanId(""); setBillingPeriod("monthly");
    setIncludeSetupFee(true); setGeneratedUrl(null); setUpgraded(false); setCopied(false);
  }

  function close() { setOpen(false); setTimeout(reset, 300); }

  function selectPlanKind(kind: PlanKind) {
    setPlanKind(kind);
    setPlanId("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId || !planId) return;

    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout-manual-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          planKind,
          planId,
          billingPeriod,
          includeSetupFee: canChargeSetupFee && includeSetupFee,
        }),
      });
      const data = (await res.json()) as { url?: string; upgraded?: boolean; error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error al generar el link de suscripción");
        return;
      }
      if (data.upgraded) {
        setUpgraded(true);
        toast.success("Plan actualizado al instante");
      } else if (data.url) {
        setGeneratedUrl(data.url);
        toast.success("Link de suscripción generado correctamente");
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const showResult = generatedUrl || upgraded;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border-[1.5px] border-[var(--gbp-accent)] px-6 py-3 text-xs font-bold text-[var(--gbp-accent)] transition-all hover:bg-[var(--gbp-accent)] hover:text-white"
      >
        <Plus className="h-4 w-4" /> Nuevo link de suscripción
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="relative z-10 flex w-full max-w-2xl max-h-[90vh] flex-col rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl overflow-hidden">

            <div className="flex shrink-0 items-center justify-between border-b border-[var(--gbp-border)] px-10 py-7">
              <div>
                <h3 className="text-2xl font-bold text-foreground">Nuevo link de suscripción</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Alta de plan recurrente sin login. Si la org ya tiene plan activo, se actualiza al instante.
                </p>
              </div>
              <button type="button" onClick={close} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {showResult ? (
              <div className="flex flex-col gap-6 overflow-y-auto px-10 py-8">
                {upgraded ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <div className="mb-2 flex items-center gap-2 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                      <p className="text-xs font-bold uppercase tracking-widest">Plan actualizado</p>
                    </div>
                    <p className="text-sm text-emerald-800">
                      <strong>{selectedOrg?.name}</strong> ya tenía una suscripción activa de este tipo — el cambio de plan
                      se aplicó al instante con prorateo sobre la tarjeta guardada. No hay link para enviar.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <p className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-700">Link generado</p>
                    <p className="mb-4 text-sm text-emerald-800">
                      Copiá el link y enviáselo a <strong>{selectedOrg?.name}</strong>. Expira en <strong>24 horas</strong> (límite de Stripe).
                    </p>
                    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3.5 text-xs font-mono text-emerald-900 break-all">
                      <Link2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="flex-1 truncate">{generatedUrl}</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-3">
                  {generatedUrl && (
                    <button
                      type="button"
                      onClick={copyUrl}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${copied ? "bg-emerald-500 text-white" : "bg-[var(--gbp-accent)] text-white hover:opacity-90"}`}
                    >
                      {copied ? <><CheckCheck className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar link</>}
                    </button>
                  )}
                  <button type="button" onClick={close} className="rounded-xl border border-[var(--gbp-border)] px-5 py-3 text-sm font-bold text-[var(--gbp-text2)]">
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-10 py-7 space-y-6">

                  <SuperadminSelectField
                    label="Organización"
                    name="org"
                    value={orgId}
                    onChange={(e) => setOrgId(e.target.value)}
                    required
                  >
                    <option value="">Seleccioná una org…</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </SuperadminSelectField>

                  <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Tipo de plan</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => selectPlanKind("integration")}
                        className={`flex items-center gap-2.5 rounded-xl border p-4 text-left transition ${
                          planKind === "integration" ? "border-sky-400 bg-sky-50 text-sky-700" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                        }`}
                      >
                        <Plug className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-bold">Integración QBO-R365</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => selectPlanKind("platform")}
                        className={`flex items-center gap-2.5 rounded-xl border p-4 text-left transition ${
                          planKind === "platform" ? "border-violet-400 bg-violet-50 text-violet-700" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                        }`}
                      >
                        <Building2 className="h-4 w-4 shrink-0" />
                        <span className="text-xs font-bold">Plataforma</span>
                      </button>
                    </div>
                  </div>

                  <SuperadminSelectField
                    label="Plan"
                    name="plan"
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    required
                  >
                    <option value="">Seleccioná un plan…</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </SuperadminSelectField>

                  <div>
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Período de facturación</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setBillingPeriod("monthly")}
                        className={`rounded-xl border p-3.5 text-xs font-bold transition ${
                          billingPeriod === "monthly" ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)]/10 text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
                        }`}
                      >
                        Mensual
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingPeriod("yearly")}
                        className={`rounded-xl border p-3.5 text-xs font-bold transition ${
                          billingPeriod === "yearly" ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)]/10 text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
                        }`}
                      >
                        Anual
                      </button>
                    </div>
                  </div>

                  {canChargeSetupFee && (
                    <button
                      type="button"
                      onClick={() => setIncludeSetupFee((v) => !v)}
                      className="flex w-full items-center gap-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-4 text-left transition hover:bg-[var(--gbp-surface2)]"
                    >
                      <div className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border ${includeSetupFee ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)]"}`}>
                        {includeSetupFee && <CheckCheck className="h-3 w-3 text-white" strokeWidth={3} />}
                      </div>
                      <div className="flex-1">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground"><Zap className="h-3.5 w-3.5" /> Cobrar setup fee</span>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">Se agrega como cargo único en el primer pago, con el descuento anual si aplica.</p>
                      </div>
                    </button>
                  )}

                  <p className="text-[11px] text-muted-foreground">
                    Si <strong>{selectedOrg?.name ?? "la organización"}</strong> ya tiene una suscripción activa de este tipo, no se genera link — el cambio de plan se aplica al instante con prorateo.
                  </p>
                </div>

                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--gbp-border)] px-10 py-6">
                  <button type="button" onClick={close} className="rounded-xl border border-[var(--gbp-border)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)]">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !orgId || !planId}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-8 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Procesando…</> : "Generar →"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
