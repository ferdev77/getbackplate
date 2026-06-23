"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Receipt, Check } from "lucide-react";
import { updateInvoicePriceAction, updateInvoiceAllowanceOverrideAction } from "./actions";

type Org = {
  organizationId: string;
  organizationName: string;
  priceCents: number | null;
  planIncluded: number;
  invoiceBalance: number;
  allowanceOverride: number | null;
};

function centsToInput(cents: number | null): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function PriceField({ org }: { org: Org }) {
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
  );
}

function AllowanceOverrideField({ org }: { org: Org }) {
  const toInput = (n: number | null) => (n == null ? "" : String(n));
  const [value, setValue] = useState(toInput(org.allowanceOverride));
  const [pending, startTransition] = useTransition();
  const savedValue = toInput(org.allowanceOverride);
  const dirty = value !== savedValue;
  const defaultAllowance = org.planIncluded + org.invoiceBalance;

  function save() {
    const trimmed = value.trim();
    const newValue = trimmed === "" ? null : Number(trimmed);
    if (trimmed !== "" && (!Number.isInteger(newValue) || newValue! < 0)) {
      toast.error("Valor inválido");
      setValue(savedValue);
      return;
    }

    const confirmMsg = newValue == null
      ? `¿Confirmás volver al cálculo normal (plan + créditos = ${defaultAllowance}) para ${org.organizationName}?`
      : `¿Confirmás forzar "${newValue} facturas incluidas" para ${org.organizationName}, ignorando su plan y créditos comprados?`;
    if (!confirm(confirmMsg)) {
      setValue(savedValue);
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set("organization_id", org.organizationId);
      formData.set("allowance_override", newValue == null ? "" : String(newValue));
      const result = await updateInvoiceAllowanceOverrideAction(formData);
      if (result.ok) {
        toast.success("Facturas incluidas actualizadas");
      } else {
        toast.error(result.error ?? "No se pudo actualizar");
        setValue(savedValue);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        step="1"
        value={value}
        disabled={pending}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
        placeholder={String(defaultAllowance)}
        className="w-20 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-1.5 text-right text-sm font-semibold text-foreground outline-none focus:border-[var(--gbp-accent)]"
      />
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
  );
}

function Row({ org }: { org: Org }) {
  const defaultAllowance = org.planIncluded + org.invoiceBalance;
  return (
    <div className="border-b border-[var(--gbp-border)] px-5 py-3.5 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-semibold text-foreground">{org.organizationName}</span>
        <PriceField org={org} />
      </div>
      <div className="mt-2 flex items-center justify-between gap-4">
        <p className="text-[11px] text-muted-foreground">
          Incluidas por defecto: {org.planIncluded} (plan) + {org.invoiceBalance} (créditos) = {defaultAllowance}
          {org.allowanceOverride != null && (
            <span className="ml-1.5 font-semibold text-amber-600">— forzado a {org.allowanceOverride}</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">Forzar incluidas:</span>
          <AllowanceOverrideField org={org} />
        </div>
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
          Se cobra solo el excedente sobre lo incluido en el plan + créditos comprados — nunca lo que ya está incluido
        </p>
      </div>
      {organizations.map((org) => (
        <Row key={org.organizationId} org={org} />
      ))}
    </div>
  );
}
