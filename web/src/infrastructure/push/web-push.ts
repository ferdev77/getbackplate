import webpush from "web-push";

if (process.env.VAPID_EMAIL && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  image?: string;
};

export type PushSubscriptionRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendPushNotification(
  subscription: PushSubscriptionRecord,
  payload: PushPayload
): Promise<{ success: boolean; expired?: boolean }> {
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
      // "high" le pide al proveedor (FCM/APNs/etc.) entregar de inmediato en vez de
      // esperar a una ventana de ahorro de batería del dispositivo.
      { urgency: "high" }
    );
    return { success: true };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    // 410 Gone / 404 = suscripción expirada o revocada por el usuario
    if (statusCode === 410 || statusCode === 404) {
      return { success: false, expired: true };
    }
    throw err;
  }
}
