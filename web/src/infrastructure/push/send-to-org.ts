import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushNotification, type PushPayload } from "./web-push";
import { logNotificationsBulk } from "@/infrastructure/notifications/log-notification";

export type PushNotificationOptions = {
  source: string;
  sourceId?: string;
  organizationId?: string | null;
  createdBy?: string | null;
};

export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload,
  options: PushNotificationOptions
): Promise<{ sent: number; expired: number; failed: number }> {
  const supabase = createSupabaseAdminClient();

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .eq("org_id", orgId)
    .eq("is_active", true);

  if (error) throw new Error(`Error leyendo suscripciones: ${error.message}`);
  if (!subscriptions?.length) return { sent: 0, expired: 0, failed: 0 };

  return _sendToSubscriptions(supabase, subscriptions, payload, {
    ...options,
    organizationId: options.organizationId ?? orgId,
  });
}

export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  options: PushNotificationOptions
): Promise<{ sent: number; expired: number; failed: number }> {
  if (!userIds.length) return { sent: 0, expired: 0, failed: 0 };

  const supabase = createSupabaseAdminClient();

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds)
    .eq("is_active", true);

  if (error) throw new Error(`Error leyendo suscripciones: ${error.message}`);
  if (!subscriptions?.length) return { sent: 0, expired: 0, failed: 0 };

  return _sendToSubscriptions(supabase, subscriptions, payload, options);
}

async function _sendToSubscriptions(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  subscriptions: Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload,
  options: PushNotificationOptions
): Promise<{ sent: number; expired: number; failed: number }> {
  let sent = 0;
  let expired = 0;
  let failed = 0;
  const expiredIds: string[] = [];
  const sentUserIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const result = await sendPushNotification(sub, payload);
        if (result.success) {
          sent++;
          sentUserIds.push(sub.user_id);
        } else if (result.expired) {
          expired++;
          expiredIds.push(sub.id);
        }
      } catch {
        failed++;
      }
    })
  );

  if (expiredIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", expiredIds);
  }

  void logNotificationsBulk(
    Array.from(new Set(sentUserIds)).map((userId) => ({
      channel: "push" as const,
      userId,
      organizationId: options.organizationId ?? null,
      title: payload.title,
      body: payload.body,
      actionUrl: payload.url ?? null,
      source: options.source,
      sourceId: options.sourceId ?? null,
      status: "sent" as const,
      createdBy: options.createdBy ?? null,
    })),
  );

  return { sent, expired, failed };
}
