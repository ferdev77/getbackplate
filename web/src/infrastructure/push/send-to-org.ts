import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushNotification, type PushPayload } from "./web-push";
import { logNotificationsBulk, type LogNotificationInput } from "@/infrastructure/notifications/log-notification";

export type PushNotificationOptions = {
  source: string;
  sourceId?: string;
  organizationId?: string | null;
  createdBy?: string | null;
  /**
   * Datos extra que quedan guardados en la fila de notifications.
   *
   * Sirve para poder reconstruir despues que fue cada envio. Hoy lo usa el
   * historial de repartos de checklists, que necesita distinguir el aviso del
   * alta del reparto automatico del cron: los dos salen con el mismo titulo.
   */
  metadata?: Record<string, unknown>;
};

export async function sendPushToOrg(
  orgId: string,
  payload: PushPayload,
  options: PushNotificationOptions
): Promise<{ sent: number; expired: number; failed: number }> {
  const supabase = createSupabaseAdminClient();

  // Se resuelven los miembros reales de la organizacion (no solo quien ya
  // tiene una suscripcion push activa) por dos motivos: para poder garantizar
  // la campanita a todos igual que sendPushToUsers, y para no depender del
  // org_id guardado en la suscripcion -- ese dato puede quedar desactualizado
  // (ej: un superadmin que impersono una org una vez y su dispositivo quedo
  // etiquetado con ese org_id para siempre, sin ser miembro real).
  const { data: memberships, error: membershipsError } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("status", "active");

  if (membershipsError) throw new Error(`Unable to read organization members: ${membershipsError.message}`);

  const memberUserIds = [...new Set((memberships ?? []).map((m) => m.user_id).filter((id): id is string => Boolean(id)))];
  if (!memberUserIds.length) return { sent: 0, expired: 0, failed: 0 };

  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", memberUserIds)
    .eq("is_active", true);

  if (error) throw new Error(`Unable to read push subscriptions: ${error.message}`);

  return _sendToSubscriptions(
    supabase,
    subscriptions ?? [],
    payload,
    { ...options, organizationId: options.organizationId ?? orgId },
    memberUserIds,
  );
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

  return _sendToSubscriptions(supabase, subscriptions ?? [], payload, options, userIds);
}

async function _sendToSubscriptions(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  subscriptions: Array<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string }>,
  payload: PushPayload,
  options: PushNotificationOptions,
  targetUserIds: string[],
): Promise<{ sent: number; expired: number; failed: number }> {
  let sent = 0;
  let expired = 0;
  let failed = 0;
  const expiredIds: string[] = [];
  const sentUserIds: string[] = [];
  const failedUserIds: string[] = [];

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
        failedUserIds.push(sub.user_id);
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
    metadata: options.metadata,
  };

  // channel:'push' queda como diagnostico interno (no se muestra en la
  // campanita, ver /api/notifications/list) -- registra que efectivamente se
  // le mando la notificacion al dispositivo, exitosa o fallida.
  const rows: LogNotificationInput[] = [...sentUserIdSet].map((userId) => ({
    ...baseRow,
    channel: "push" as const,
    userId,
  }));

  for (const userId of new Set(failedUserIds)) {
    if (sentUserIdSet.has(userId)) continue;
    rows.push({ ...baseRow, channel: "push" as const, userId, status: "failed" as const });
  }

  // channel:'in_app' es el registro garantizado: se escribe siempre, para
  // todo destinatario, haya o no recibido el push -- es la fuente de verdad
  // de "esto te tenia que llegar", el push es solo un aviso en tiempo real
  // ademas de esto, no un requisito para que quede constancia.
  for (const userId of new Set(targetUserIds)) {
    rows.push({ ...baseRow, channel: "in_app" as const, userId });
  }

  try {
    await logNotificationsBulk(rows);
  } catch (err) {
    console.error("[push] logNotificationsBulk failed:", err instanceof Error ? err.message : err);
  }

  return { sent, expired, failed };
}
