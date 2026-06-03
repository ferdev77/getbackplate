"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Copy, CheckCheck, Loader2, Link2, Zap, FileStack, Tag } from "lucide-react";
import { SuperadminInputField, SuperadminSelectField } from "@/shared/ui/superadmin-form-fields";

type Org = { id: string; name: string };
type Module = { id: string; code: string; name: string };

type ActionType = "activate_module" | "add_invoices" | "custom";

const ACTION_META: Record<ActionType, { label: string; icon: React.ElementType; color: string; description: string }> = {
  activate_module: {
    label: "Activar módulo",
    icon: Zap,
    color: "violet",
    description: "Activa un módulo en la organización al confirmar el pago.",
  },
  add_invoices: {
    label: "Agregar facturas",
    icon: FileStack,
    color: "emerald",
    description: "Suma N facturas al balance de la organización (requiere módulo QBO activo).",
  },
  custom: {
    label: "Cobro personalizado",
    icon: Tag,
    color: "amber",
    description: "Registra el pago sin ejecutar ninguna acción automática.",
  },
};

type Props = {
  organizations: Org[];
  modules: Module[];
};

export function PaymentLinkModal({ organizations, modules }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [orgId, setOrgId] = useState("");
  const [description, setDescription] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [actionType, setActionType] = useState<ActionType>("custom");
  const [moduleCode, setModuleCode] = useState("");
  const [invoiceCount, setInvoiceCount] = useState("");
  const [expiresInDays, setExpiresInDays] = useState("7");

  function reset() {
    setOrgId(""); setDescription(""); setInternalNotes(""); setAmount("");
    setCurrency("usd"); setActionType("custom"); setModuleCode("");
    setInvoiceCount(""); setExpiresInDays("7"); setGeneratedUrl(null); setCopied(false);
  }

  function close() { setOpen(false); setTimeout(reset, 300); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = Math.round(parseFloat(amount) * 100);
    if (!orgId || !description.trim() || !amountCents || amountCents <= 0) return;

    const actionPayload =
      actionType === "activate_module" ? { moduleCode } :
      actionType === "add_invoices"    ? { invoiceCount: Number(invoiceCount) } :
      undefined;

    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          description: description.trim(),
          internalNotes: internalNotes.trim() || undefined,
          amountCents,
          currency,
          actionType,
          actionPayload,
          expiresInDays: Number(expiresInDays),
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        alert(data.error ?? "Error al generar el link");
        return;
      }
      setGeneratedUrl(data.url);
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

  const selectedOrg = organizations.find(o => o.id === orgId);
  const actionMeta = ACTION_META[actionType];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-6 py-3 text-xs font-bold text-white shadow-[var(--gbp-shadow-accent)] transition-all hover:bg-[var(--gbp-accent-hover)] hover:scale-[1.02]"
      >
        <Plus className="h-4 w-4" /> Nuevo link de pago
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="relative z-10 w-full max-w-2xl rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-10 shadow-2xl">

            {/* Header */}
            <div className="mb-6 flex items-center justify-between border-b border-[var(--gbp-border)] pb-6">
              <div>
                <h3 className="text-2xl font-bold text-foreground">Nuevo link de pago</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">Genera un checkout Stripe para una organización.</p>
              </div>
              <button type="button" onClick={close} className="rounded-xl p-2 text-muted-foreground transition-colors hover:bg-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {generatedUrl ? (
              /* ── Success state ── */
              <div className="space-y-6">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                  <p className="mb-1 text-xs font-bold uppercase tracking-widest text-emerald-700">Link generado</p>
                  <p className="mb-3 text-sm text-emerald-800">
                    Copiá el link y enviáselo a <strong>{selectedOrg?.name}</strong>. El link expira en {expiresInDays} días.
                  </p>
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-xs font-mono text-emerald-900 break-all">
                    <Link2 className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="flex-1 truncate">{generatedUrl}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={copyUrl}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${copied ? "bg-emerald-500 text-white" : "bg-[var(--gbp-accent)] text-white hover:opacity-90"}`}
                  >
                    {copied ? <><CheckCheck className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar link</>}
                  </button>
                  <button type="button" onClick={close} className="rounded-xl border border-[var(--gbp-border)] px-4 py-3 text-sm font-bold text-[var(--gbp-text2)]">
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmit} className="max-h-[65vh] space-y-6 overflow-y-auto pr-1 scrollbar-hide">

                {/* Org + amount */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <SuperadminSelectField
                    label="Organización"
                    name="org"
                    value={orgId}
                    onChange={e => setOrgId(e.target.value)}
                    required
                  >
                    <option value="">Seleccioná una org…</option>
                    {organizations.map(o => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </SuperadminSelectField>
                  <div className="grid grid-cols-2 gap-3">
                    <SuperadminInputField
                      label="Monto ($)"
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      required
                    />
                    <SuperadminSelectField
                      label="Moneda"
                      name="currency"
                      value={currency}
                      onChange={e => setCurrency(e.target.value)}
                    >
                      <option value="usd">USD</option>
                      <option value="ars">ARS</option>
                    </SuperadminSelectField>
                  </div>
                </div>

                {/* Description */}
                <SuperadminInputField
                  label="Descripción (visible en Stripe)"
                  name="description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="p.ej: Módulo Mantenimiento — Pack inicial"
                  required
                />

                {/* Action type */}
                <div>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Acción al pagar
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(ACTION_META) as [ActionType, typeof ACTION_META[ActionType]][]).map(([type, meta]) => {
                      const Icon = meta.icon;
                      const active = actionType === type;
                      const colorCls = active
                        ? meta.color === "violet" ? "border-violet-400 bg-violet-50 text-violet-700"
                        : meta.color === "emerald" ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setActionType(type)}
                          className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition ${colorCls}`}
                        >
                          <Icon className="h-4 w-4" />
                          <span className="text-xs font-bold">{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">{actionMeta.description}</p>
                </div>

                {/* Action payload */}
                {actionType === "activate_module" && (
                  <SuperadminSelectField
                    label="Módulo a activar"
                    name="module_code"
                    value={moduleCode}
                    onChange={e => setModuleCode(e.target.value)}
                    required
                  >
                    <option value="">Seleccioná un módulo…</option>
                    {modules.map(m => (
                      <option key={m.id} value={m.code}>{m.name}</option>
                    ))}
                  </SuperadminSelectField>
                )}

                {actionType === "add_invoices" && (
                  <SuperadminInputField
                    label="Cantidad de facturas a acreditar"
                    name="invoice_count"
                    type="number"
                    min="1"
                    step="1"
                    value={invoiceCount}
                    onChange={e => setInvoiceCount(e.target.value)}
                    placeholder="p.ej: 500"
                    required
                  />
                )}

                {/* Expiry + notes */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <SuperadminInputField
                    label="Expira en (días)"
                    name="expires_in_days"
                    type="number"
                    min="1"
                    max="30"
                    value={expiresInDays}
                    onChange={e => setExpiresInDays(e.target.value)}
                  />
                  <SuperadminInputField
                    label="Notas internas (opcional)"
                    name="internal_notes"
                    value={internalNotes}
                    onChange={e => setInternalNotes(e.target.value)}
                    placeholder="Solo visible para el equipo"
                  />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 border-t border-[var(--gbp-border)] pt-6">
                  <button type="button" onClick={close} className="rounded-xl border border-[var(--gbp-border)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)]">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-8 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] disabled:opacity-60"
                  >
                    {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Generando…</> : "Generar link →"}
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
