import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushNotification, type PushPayload } from "./web-push";
import { logNotificationsBulk, type LogNotificationInput } from "@/infrastructure/notifications/log-notification";

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

  if (error) throw new Error(`Unable to read push subscriptions: ${error.message}`);
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

  if (error) throw new Error(`Unable to read push subscriptions: ${error.message}`);

  // Se pasa la lista completa de destinatarios (targetUserIds) para que, aunque
  // no tengan una suscripcion push activa, igual quede un registro garantizado
  // en su campanita — el push es un extra, no un requisito para enterarse.
  return _sendToSubscriptions(supabase, subscriptions ?? [], payload, options, userIds);
}

async function _sendToSubscriptions(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  subscriptions: Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload,
  options: PushNotificationOptions,
  targetUserIds?: string[],
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
      } catch (err) {
        failed++;
        console.error("[push] sendPushNotification failed:", {
          subscriptionId: sub.id,
          userId: sub.user_id,
          source: options.source,
          statusCode: (err as { statusCode?: number } | undefined)?.statusCode,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })
  );

  if (expiredIds.length > 0) {
    await supabase
      .from("push_subscriptions")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in("id", expiredIds);
  }

  const sentUserIdSet = new Set(sentUserIds);
  const baseRow = {
    organizationId: options.organizationId ?? null,
    title: payload.title,
    body: payload.body,
    actionUrl: payload.url ?? null,
    source: options.source,
    sourceId: options.sourceId ?? null,
    status: "sent" as const,
    createdBy: options.createdBy ?? null,
  };

  const rows: LogNotificationInput[] = [...sentUserIdSet].map((userId) => ({
    ...baseRow,
    channel: "push" as const,
    userId,
  }));

  for (const userId of new Set(targetUserIds ?? [])) {
    if (sentUserIdSet.has(userId)) continue;
    rows.push({ ...baseRow, channel: "in_app" as const, userId });
  }

  logNotificationsBulk(rows).catch((err) =>
    console.error("[push] logNotificationsBulk failed:", err instanceof Error ? err.message : err),
  );

  return { sent, expired, failed };
}
