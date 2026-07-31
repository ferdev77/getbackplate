"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { toast } from "sonner";
import { subscribeToPush, unsubscribeFromPush } from "@/shared/lib/push-subscribe";
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

  async function handleClick() {
    if (isPending || isBlocked) return;
    setIsPending(true);
    try {
      if (enabled) {
        const ok = await unsubscribeFromPush();
        if (ok) {
          setEnabled(false);
          toast.success(t("Notificaciones push desactivadas"));
        } else {
          toast.error(t("No se pudo desactivar"));
        }
      } else {
        const ok = await subscribeToPush({ orgId });
        if (typeof window !== "undefined" && "Notification" in window) {
          setBrowserPermission(Notification.permission);
        }
        if (ok) {
          setEnabled(true);
          toast.success(t("Notificaciones push activadas"));
        } else {
          toast.error(t("No se pudo activar. Revisá el permiso de notificaciones del navegador."));
        }
      }
    } finally {
      setIsPending(false);
    }
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
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
        enabled
          ? "border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
          : "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] hover:opacity-90"
      }`}
    >
      {enabled ? <BellRing className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
      {enabled ? t("Push activado") : t("Push desactivado — Activar")}
    </button>
  );
}
