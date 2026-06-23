"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Receipt, Check } from "lucide-react";
import { updateInvoicePriceAction } from "./actions";

type Org = {
  organizationId: string;
  organizationName: string;
  priceCents: number | null;
};

function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function Row({ org }: { org: Org }) {
  const [value, setValue] = useState(centsToInput(org.priceCents));
  const [pending, startTransition] = useTransition();
  const savedValue = centsToInput(org.priceCents);
  const dirty = value !== savedValue;

  function save() {
    const trimmed = value.trim();
    const newCents = trimmed === "" ? null : Math.round(parseFloat(trimmed) * 100);
    if (trimmed !== "" && (!Number.isFinite(newCents) || newCents! < 0)) {
      toast.error("Precio inválido");
      setValue(savedValue);
      return;
    }

    const confirmMsg = newCents == null
      ? `¿Confirmás desactivar el cobro por factura para ${org.organizationName}?`
      : `¿Confirmás cobrar $${(newCents / 100).toFixed(2)} por factura enviada a ${org.organizationName} a partir de la próxima renovación?`;
    if (!confirm(confirmMsg)) {
      setValue(savedValue);
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organization_id", org.organizationId);
      formData.set("price_cents", newCents == null ? "" : String(newCents));
      const result = await updateInvoicePriceAction(formData);
      if (result.ok) {
        toast.success("Precio actualizado");
      } else {
        toast.error(result.error ?? "No se pudo actualizar el precio");
        setValue(savedValue);
      }
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--gbp-border)] px-5 py-3.5 last:border-b-0">
      <span className="text-sm font-semibold text-foreground">{org.organizationName}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
          placeholder="Sin cobro"
          className="w-28 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-1.5 text-right text-sm font-semibold text-foreground outline-none focus:border-[var(--gbp-accent)]"
        />
        <span className="text-[11px] text-muted-foreground">/ factura</span>
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            Guardar
          </button>
        )}
      </div>
    </div>
  );
}

export function InvoicePriceList({ organizations }: { organizations: Org[] }) {
  if (organizations.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--gbp-border)] px-8 py-10 text-center">
        <p className="text-sm font-semibold text-muted-foreground">No hay organizaciones con integración QBO-R365 activa.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-3">
        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Se suma como cargo extra en cada renovación, calculado sobre las facturas enviadas durante el período
        </p>
      </div>
      {organizations.map((org) => (
        <Row key={org.organizationId} org={org} />
      ))}
    </div>
  );
}
