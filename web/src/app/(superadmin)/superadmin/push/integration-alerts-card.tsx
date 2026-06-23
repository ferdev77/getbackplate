"use client";

import { useState } from "react";
import { Radio, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { subscribeToPush } from "@/shared/lib/push-subscribe";

export function IntegrationAlertsCard({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, setIsPending] = useState(false);

  async function handleEnable() {
    setIsPending(true);
    try {
      const ok = await subscribeToPush({ notifyIntegrationAlerts: true });
      if (!ok) {
        toast.error("No se pudo activar — revisá el permiso de notificaciones del navegador");
        return;
      }
      setEnabled(true);
      toast.success("Alertas de integraciones activadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al activar");
    } finally {
      setIsPending(false);
    }
  }

  async function handleDisable() {
    setIsPending(true);
    try {
      const res = await fetch("/api/superadmin/push/integration-alerts", { method: "DELETE" });
      if (!res.ok) throw new Error("Error al desactivar");
      setEnabled(false);
      toast.success("Alertas de integraciones desactivadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <article className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold tracking-tight text-[var(--gbp-text)]">
        <Radio className="h-4 w-4 text-[var(--gbp-accent)]" /> Alertas de integraciones
      </h2>
      <p className="text-xs text-[var(--gbp-text2)]">
        Recibí un push cuando un webhook de QBO → R365 no se pueda identificar, se envíe con éxito, o falle —
        de cualquier organización.
      </p>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3">
        <span className={`text-sm font-semibold ${enabled ? "text-emerald-600" : "text-[var(--gbp-text2)]"}`}>
          {enabled ? "Activadas en este dispositivo" : "Desactivadas"}
        </span>
        <button
          type="button"
          onClick={enabled ? handleDisable : handleEnable}
          disabled={isPending}
          className={`inline-flex items-center gap-2 rounded-xl border-[1.5px] px-4 py-2 text-xs font-bold transition-all disabled:opacity-50 ${
            enabled
              ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
              : "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] hover:opacity-90"
          }`}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {enabled ? "Desactivar" : "Activar"}
        </button>
      </div>

      {!enabled && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Al activar, el navegador va a pedir permiso de notificaciones si todavía no lo diste.
        </div>
      )}
    </article>
  );
}
