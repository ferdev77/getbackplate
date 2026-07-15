"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { subscribeToPush } from "@/shared/lib/push-subscribe";

type Props = { orgId?: string };

export function PushPermissionManager({ orgId }: Props) {
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem("push-permission-asked")) return;

    function activate() {
      subscribeToPush({ orgId })
        .then((ok) => {
          if (ok) {
            toast.success("Notifications enabled");
            return;
          }
          // Safari exige que el permiso se pida desde un clic real del usuario;
          // el intento automático queda "sin decidir" ahí, así que ofrecemos un botón.
          if (Notification.permission === "default") {
            toast.message("Enable notifications so you do not miss important updates", {
              duration: Infinity,
              action: { label: "Enable", onClick: activate },
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
