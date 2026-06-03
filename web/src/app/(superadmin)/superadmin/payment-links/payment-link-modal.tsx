"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, Copy, CheckCheck, Loader2, Link2, Zap, FileStack, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
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

type ItemDraft = {
  description: string;
  amount: string;
  actionType: ActionType;
  moduleCode: string;
  invoiceCount: string;
};

const EMPTY_ITEM: ItemDraft = {
  description: "",
  amount: "",
  actionType: "custom",
  moduleCode: "",
  invoiceCount: "",
};

type Props = {
  organizations: Org[];
  modules: Module[];
};

function fmtTotal(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", minimumFractionDigits: 2,
  }).format(cents / 100);
}

export function PaymentLinkModal({ organizations, modules }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [orgId, setOrgId] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([{ ...EMPTY_ITEM }]);

  function reset() {
    setOrgId(""); setInternalNotes("");
    setItems([{ ...EMPTY_ITEM }]);
    setGeneratedUrl(null); setCopied(false);
  }

  function close() { setOpen(false); setTimeout(reset, 300); }

  function addItem() { setItems(prev => [...prev, { ...EMPTY_ITEM }]); }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx: number, patch: Partial<ItemDraft>) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  const totalCents = items.reduce((sum, item) => {
    const c = Math.round(parseFloat(item.amount || "0") * 100);
    return sum + (isNaN(c) ? 0 : c);
  }, 0);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!orgId) return;

    for (const item of items) {
      const cents = Math.round(parseFloat(item.amount) * 100);
      if (!item.description.trim() || !cents || cents <= 0) return;
      if (item.actionType === "activate_module" && !item.moduleCode) return;
      if (item.actionType === "add_invoices" && (!item.invoiceCount || Number(item.invoiceCount) <= 0)) return;
    }

    const apiItems = items.map(item => ({
      description: item.description.trim(),
      amountCents: Math.round(parseFloat(item.amount) * 100),
      actionType: item.actionType,
      actionPayload:
        item.actionType === "activate_module" ? { moduleCode: item.moduleCode } :
        item.actionType === "add_invoices"    ? { invoiceCount: Number(item.invoiceCount) } :
        undefined,
    }));

    setLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: orgId,
          internalNotes: internalNotes.trim() || undefined,
          currency: "usd",
          items: apiItems,
        }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        toast.error(data.error ?? "Error al generar el link de pago");
        return;
      }
      setGeneratedUrl(data.url);
      toast.success("Link de pago generado correctamente");
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
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
          <div className="relative z-10 flex w-full max-w-3xl max-h-[90vh] flex-col rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl overflow-hidden">

            {/* Header — siempre visible */}
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--gbp-border)] px-10 py-7">
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
              <div className="flex flex-col gap-6 overflow-y-auto px-10 py-8">
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
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={copyUrl}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${copied ? "bg-emerald-500 text-white" : "bg-[var(--gbp-accent)] text-white hover:opacity-90"}`}
                  >
                    {copied ? <><CheckCheck className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar link</>}
                  </button>
                  <button type="button" onClick={close} className="rounded-xl border border-[var(--gbp-border)] px-5 py-3 text-sm font-bold text-[var(--gbp-text2)]">
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              /* ── Form ── */
              <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto px-10 py-7 space-y-6">

                  {/* Org */}
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

                  {/* Items */}
                  <div className="space-y-4">
                    {items.map((item, idx) => (
                      <ItemCard
                        key={idx}
                        idx={idx}
                        item={item}
                        modules={modules}
                        canRemove={items.length > 1}
                        onRemove={() => removeItem(idx)}
                        onChange={patch => updateItem(idx, patch)}
                      />
                    ))}
                  </div>

                  {/* Add item */}
                  <button
                    type="button"
                    onClick={addItem}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--gbp-border)] py-3.5 text-xs font-bold text-muted-foreground transition hover:border-[var(--gbp-accent)] hover:text-[var(--gbp-accent)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar item
                  </button>

                  {/* Total */}
                  {totalCents > 0 && (
                    <div className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-4">
                      <span className="text-sm font-semibold text-muted-foreground">
                        Total{items.length > 1 ? ` (${items.length} items)` : ""}
                      </span>
                      <span className="text-lg font-extrabold text-foreground">{fmtTotal(totalCents)}</span>
                    </div>
                  )}

                  {/* Expiry + Notes */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex items-center gap-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-4">
                      <span className="text-sm text-muted-foreground">⏱ Expira en:</span>
                      <span className="text-sm font-bold text-foreground">24 hs</span>
                      <span className="ml-auto text-[10px] text-muted-foreground/60">límite de Stripe</span>
                    </div>
                    <SuperadminInputField
                      label="Notas internas (opcional)"
                      name="internal_notes"
                      value={internalNotes}
                      onChange={e => setInternalNotes(e.target.value)}
                      placeholder="Solo visible para el equipo"
                    />
                  </div>
                </div>

                {/* Footer — siempre visible */}
                <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[var(--gbp-border)] px-10 py-6">
                  <button type="button" onClick={close} className="rounded-xl border border-[var(--gbp-border)] px-6 py-2.5 text-sm font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)]">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-8 py-2.5 text-sm font-bold text-white shadow-[var(--gbp-shadow-accent)] transition hover:opacity-90 disabled:opacity-60"
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

/* ── Item card ──────────────────────────────────────────────── */

type ItemCardProps = {
  idx: number;
  item: ItemDraft;
  modules: Module[];
  canRemove: boolean;
  onRemove: () => void;
  onChange: (patch: Partial<ItemDraft>) => void;
};

function ItemCard({ idx, item, modules, canRemove, onRemove, onChange }: ItemCardProps) {
  const actionMeta = ACTION_META[item.actionType];

  return (
    <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6 space-y-5">

      {/* Item header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Item {idx + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg p-1.5 text-muted-foreground/50 transition hover:bg-rose-50 hover:text-rose-500"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Descripción / Monto / USD — 3 columnas */}
      <div className="grid gap-4 sm:grid-cols-[1fr_160px_56px]">
        <SuperadminInputField
          label="Descripción"
          name={`desc_${idx}`}
          value={item.description}
          onChange={e => onChange({ description: e.target.value })}
          placeholder="p.ej: Módulo Mantenimiento"
          required
        />
        <SuperadminInputField
          label="Monto ($)"
          name={`amount_${idx}`}
          type="number"
          min="0.01"
          step="0.01"
          value={item.amount}
          onChange={e => onChange({ amount: e.target.value })}
          placeholder="0.00"
          required
        />
        <div className="mt-3 flex items-center justify-center rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] py-3.5 text-sm font-bold text-[var(--gbp-text2)]">
          USD
        </div>
      </div>

      {/* Acción al pagar */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Acción al pagar
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(ACTION_META) as [ActionType, typeof ACTION_META[ActionType]][]).map(([type, meta]) => {
            const Icon = meta.icon;
            const active = item.actionType === type;
            const colorCls = active
              ? meta.color === "violet"  ? "border-violet-400 bg-violet-50 text-violet-700"
              : meta.color === "emerald" ? "border-emerald-400 bg-emerald-50 text-emerald-700"
              : "border-amber-400 bg-amber-50 text-amber-700"
              : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
            return (
              <button
                key={type}
                type="button"
                onClick={() => onChange({ actionType: type, moduleCode: "", invoiceCount: "" })}
                className={`flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition ${colorCls}`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-xs font-bold">{meta.label}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2.5 text-[11px] text-muted-foreground">{actionMeta.description}</p>
      </div>

      {/* Payload condicional */}
      {item.actionType === "activate_module" && (
        <SuperadminSelectField
          label="Módulo a activar"
          name={`module_${idx}`}
          value={item.moduleCode}
          onChange={e => onChange({ moduleCode: e.target.value })}
          required
        >
          <option value="">Seleccioná un módulo…</option>
          {modules.map(m => (
            <option key={m.id} value={m.code}>{m.name}</option>
          ))}
        </SuperadminSelectField>
      )}

      {item.actionType === "add_invoices" && (
        <SuperadminInputField
          label="Cantidad de facturas a acreditar"
          name={`invoices_${idx}`}
          type="number"
          min="1"
          step="1"
          value={item.invoiceCount}
          onChange={e => onChange({ invoiceCount: e.target.value })}
          placeholder="p.ej: 500"
          required
        />
      )}
    </div>
  );
}
