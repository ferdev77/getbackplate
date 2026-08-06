"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { subscribeToPush } from "@/shared/lib/push-subscribe";
import { createTranslator } from "./company-shell.i18n";

type Props = { orgId?: string; locale?: "es" | "en" };

export function PushPermissionManager({ orgId, locale = "es" }: Props) {
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem("push-permission-asked")) return;

    const t = createTranslator(locale);

    function activate() {
      subscribeToPush({ orgId })
        .then((ok) => {
          // Recien marcamos "ya preguntamos" cuando el usuario efectivamente
          // contesto algo (aceptar/rechazar) — si esto falla por un motivo
          // transitorio (red, etc.), el permiso del navegador sigue en
          // "default" y merece reintentarse en la proxima carga de pagina.
          sessionStorage.setItem("push-permission-asked", "1");
          if (ok) {
            toast.success(t("Notificaciones activadas"));
            return;
          }
          // Safari exige que el permiso se pida desde un clic real del usuario;
          // el intento automático queda "sin decidir" ahí, así que ofrecemos un botón.
          if (Notification.permission === "default") {
            toast.message(t("Activa las notificaciones para no perderte novedades importantes"), {
              duration: Infinity,
              action: { label: t("Activar"), onClick: activate },
            });
          }
        })
        .catch((err) => console.error("[push] Error al suscribirse:", err));
    }

    const timer = setTimeout(activate, 5000);

    return () => clearTimeout(timer);
  }, [orgId, locale]);

  return null;
}
