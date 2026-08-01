"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { subscribeToPush } from "@/shared/lib/push-subscribe";
import { createTranslator } from "./company-shell.i18n";

type Locale = "es" | "en";

export function PushStatusChip({
  initialEnabled,
  orgId,
  locale = "es",
}: {
  initialEnabled: boolean;
  orgId?: string;
  locale?: Locale;
}) {
  const t = createTranslator(locale);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isPending, setIsPending] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setBrowserPermission(Notification.permission);
    }
  }, []);

  const isBlocked = !enabled && browserPermission === "denied";

  async function handleEnable() {
    if (isPending) return;
    setIsPending(true);
    try {
      const ok = await subscribeToPush({ orgId });
      if (typeof window !== "undefined" && "Notification" in window) {
        setBrowserPermission(Notification.permission);
      }
      if (ok) {
        setEnabled(true);
        toast.success(t("Notificaciones activadas"));
      } else {
        toast.error(t("No se pudo activar. Revisá el permiso de notificaciones del navegador."));
      }
    } finally {
      setIsPending(false);
    }
  }

  if (enabled) {
    // A proposito no se puede desactivar desde aca: si alguien quiere dejar de
    // recibir push, lo hace desde el permiso de notificaciones del navegador.
    return (
      <span
        title={t("Para desactivarlas, hacelo desde la configuración de notificaciones de tu navegador (ícono de candado junto a la URL).")}
        className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600"
      >
        <BellRing className="h-3.5 w-3.5" /> {t("Push activado")}
      </span>
    );
  }

  if (isBlocked) {
    return (
      <span
        title={t("Bloqueaste las notificaciones para este sitio. Habilitalas desde la configuración del navegador (ícono de candado junto a la URL) y recargá la página.")}
        className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600"
      >
        <BellOff className="h-3.5 w-3.5" /> {t("Push bloqueado")}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleEnable}
      disabled={isPending}
      className="inline-flex items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] px-3 py-1.5 text-xs font-semibold text-[var(--gbp-accent)] transition-colors hover:opacity-90 disabled:opacity-60"
    >
      <Bell className="h-3.5 w-3.5" /> {t("Push desactivado — Activar")}
    </button>
  );
}
