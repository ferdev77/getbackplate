"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { subscribeToPush } from "@/shared/lib/push-subscribe";

type Props = { orgId: string };

export function PushPermissionManager({ orgId }: Props) {
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem("push-permission-asked")) return;

    const timer = setTimeout(() => {
      sessionStorage.setItem("push-permission-asked", "1");
      subscribeToPush({ orgId })
        .then((ok) => {
          if (ok) toast.success("Notificaciones activadas");
        })
        .catch((err) => console.error("[push] Error al suscribirse:", err));
    }, 5000);

    return () => clearTimeout(timer);
  }, [orgId]);

  return null;
}
