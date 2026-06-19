"use client";

import { useEffect } from "react";
import { toast } from "sonner";

type Props = { orgId: string };

export function PushPermissionManager({ orgId }: Props) {
  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "default") return;
    if (sessionStorage.getItem("push-permission-asked")) return;

    const timer = setTimeout(() => {
      sessionStorage.setItem("push-permission-asked", "1");
      requestPermission(orgId);
    }, 5000);

    return () => clearTimeout(timer);
  }, [orgId]);

  return null;
}

async function requestPermission(orgId: string) {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  try {
    const registration = await navigator.serviceWorker.ready;

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      }));

    const json = subscription.toJSON() as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        orgId,
        userAgent: navigator.userAgent,
      }),
    });

    toast.success("Notificaciones activadas");
  } catch (err) {
    console.error("[push] Error al suscribirse:", err);
  }
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i++) {
    view[i] = rawData.charCodeAt(i);
  }
  return buffer;
}
