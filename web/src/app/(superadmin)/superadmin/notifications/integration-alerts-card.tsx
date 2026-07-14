"use client";

import { useEffect, useState } from "react";
import { Radio, Loader2, AlertTriangle, Ban } from "lucide-react";
import { toast } from "sonner";
import { subscribeToPush } from "@/shared/lib/push-subscribe";

export function IntegrationAlertsCard({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, setIsPending] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  async function handleEnable() {
    setIsPending(true);
    try {
      const ok = await subscribeToPush();
      setBrowserPermission(typeof window !== "undefined" && "Notification" in window ? Notification.permission : null);
      if (!ok) {
        toast.error("No se pudo activar — revisá el permiso de notificaciones del navegador");
        return;
      }
      setEnabled(true);
      toast.success("Notificaciones push activadas en este dispositivo");
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
      toast.success("Notificaciones push desactivadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar");
    } finally {
      setIsPending(false);
    }
  }

  const isBlocked = !enabled && browserPermission === "denied";

  return (
    <article className="rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold tracking-tight text-[var(--gbp-text)]">
        <Radio className="h-4 w-4 text-[var(--gbp-accent)]" /> Notificaciones push
      </h2>
      <p className="text-xs text-[var(--gbp-text2)]">
        Como superadmin recibís automáticamente un push cuando un webhook de QuickBooks → R365 no se pueda identificar,
        se envíe con éxito, o falle — de cualquier organización. Esto requiere tener las notificaciones push
        activadas en el navegador.
      </p>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3">
        <span className={`text-sm font-semibold ${enabled ? "text-emerald-600" : "text-[var(--gbp-text2)]"}`}>
          {enabled ? "Activadas en este dispositivo" : "Desactivadas en este dispositivo"}
        </span>
        {!isBlocked && (
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
        )}
      </div>

      {isBlocked && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <Ban className="mt-0.5 h-4 w-4 shrink-0" />
          Bloqueaste las notificaciones para este sitio en tu navegador, así que no se puede volver a pedir el
          permiso desde acá. Activalas manualmente desde la configuración del sitio (ícono de candado en la
          barra de direcciones → Notificaciones → Permitir) y después recargá la página.
        </div>
      )}

      {!enabled && !isBlocked && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Al activar, el navegador va a pedir permiso de notificaciones si todavía no lo diste.
        </div>
      )}
    </article>
  );
}
