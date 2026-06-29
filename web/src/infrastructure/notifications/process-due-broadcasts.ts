import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { dispatchNotificationBroadcast, type NotificationBroadcastChannel } from "./dispatch-broadcast";

export async function processDueNotificationBroadcasts() {
  const supabase = createSupabaseAdminClient();

  const { data: candidates, error: candidatesError } = await supabase
    .from("notification_broadcasts")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (candidatesError) {
    console.error("[notification-broadcasts] Error leyendo candidatos:", candidatesError.message);
    return { ok: false, processed: 0, error: candidatesError.message };
  }
  if (!candidates || candidates.length === 0) {
    return { ok: true, processed: 0 };
  }

  const candidateIds = candidates.map((c) => c.id);

  // Claim atómico: solo procesamos las filas que sigan en 'pending' en este momento.
  const { data: claimed, error: claimError } = await supabase
    .from("notification_broadcasts")
    .update({ status: "processing" })
    .in("id", candidateIds)
    .eq("status", "pending")
    .select("id, created_by, channels, title, body, image_url, action_url, target_type, target_all, org_ids, user_ids");

  if (claimError) {
    console.error("[notification-broadcasts] Error reclamando candidatos:", claimError.message);
    return { ok: false, processed: 0, error: claimError.message };
  }
  if (!claimed || claimed.length === 0) {
    return { ok: true, processed: 0 };
  }

  let processed = 0;
  let failedRows = 0;

  await Promise.allSettled(
    claimed.map(async (row) => {
      try {
        const channels = (row.channels ?? ["push"]) as NotificationBroadcastChannel[];
        const result =
          row.target_type === "users"
            ? await dispatchNotificationBroadcast({
                channels,
                title: row.title,
                body: row.body,
                imageUrl: row.image_url ?? undefined,
                actionUrl: row.action_url ?? undefined,
                createdBy: row.created_by,
                targetType: "users",
                userIds: row.user_ids,
              })
            : await dispatchNotificationBroadcast({
                channels,
                title: row.title,
                body: row.body,
                imageUrl: row.image_url ?? undefined,
                actionUrl: row.action_url ?? undefined,
                createdBy: row.created_by,
                targetType: "orgs",
                orgIds: row.target_all ? "all" : row.org_ids,
              });

        await supabase
          .from("notification_broadcasts")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            push_sent: result.pushSent,
            push_expired: result.pushExpired,
            push_failed: result.pushFailed,
            email_sent: result.emailSent,
            email_failed: result.emailFailed,
          })
          .eq("id", row.id);
        processed += 1;
      } catch (error) {
        failedRows += 1;
        await supabase.from("notification_broadcasts").update({ status: "failed" }).eq("id", row.id);
        console.error(`[notification-broadcasts] Error procesando ${row.id}:`, error);
      }
    }),
  );

  return { ok: true, processed, failed: failedRows };
}
