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

    function activate() {
      subscribeToPush({ orgId })
        .then((ok) => {
          if (ok) {
            toast.success("Notificaciones activadas");
            return;
          }
          // Safari exige que el permiso se pida desde un clic real del usuario;
          // el intento automático queda "sin decidir" ahí, así que ofrecemos un botón.
          if (Notification.permission === "default") {
            toast.message("Activá las notificaciones para no perderte avisos importantes", {
              duration: Infinity,
              action: { label: "Activar", onClick: activate },
            });
          }
        })
        .catch((err) => console.error("[push] Error al suscribirse:", err));
    }

    const timer = setTimeout(() => {
      sessionStorage.setItem("push-permission-asked", "1");
      activate();
    }, 5000);

    return () => clearTimeout(timer);
  }, [orgId]);

  return null;
}
