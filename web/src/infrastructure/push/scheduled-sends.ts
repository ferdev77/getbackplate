import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { dispatchSuperadminPushBroadcast } from "./superadmin-broadcast";

export async function processDuePushScheduledSends() {
  const supabase = createSupabaseAdminClient();

  const { data: candidates, error: candidatesError } = await supabase
    .from("push_scheduled_sends")
    .select("id")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (candidatesError) {
    console.error("[push-scheduled-send] Error leyendo candidatos:", candidatesError.message);
    return { ok: false, processed: 0, error: candidatesError.message };
  }
  if (!candidates || candidates.length === 0) {
    return { ok: true, processed: 0 };
  }

  const candidateIds = candidates.map((c) => c.id);

  // Claim atómico: solo procesamos las filas que sigan en 'pending' en este momento.
  const { data: claimed, error: claimError } = await supabase
    .from("push_scheduled_sends")
    .update({ status: "processing" })
    .in("id", candidateIds)
    .eq("status", "pending")
    .select("id, created_by, title, body, image_url, target_type, target_all, org_ids, user_ids");

  if (claimError) {
    console.error("[push-scheduled-send] Error reclamando candidatos:", claimError.message);
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
        const result =
          row.target_type === "users"
            ? await dispatchSuperadminPushBroadcast({
                title: row.title,
                body: row.body,
                image: row.image_url ?? undefined,
                sentBy: row.created_by,
                targetType: "users",
                userIds: row.user_ids,
              })
            : await dispatchSuperadminPushBroadcast({
                title: row.title,
                body: row.body,
                image: row.image_url ?? undefined,
                sentBy: row.created_by,
                targetType: "orgs",
                orgIds: row.target_all ? "all" : row.org_ids,
              });
        await supabase
          .from("push_scheduled_sends")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
            sent: result.sent,
            expired: result.expired,
            failed: result.failed,
          })
          .eq("id", row.id);
        processed++;
      } catch (error) {
        failedRows++;
        await supabase
          .from("push_scheduled_sends")
          .update({ status: "failed" })
          .eq("id", row.id);
        console.error(`[push-scheduled-send] Error procesando ${row.id}:`, error);
      }
    }),
  );

  return { ok: true, processed, failed: failedRows };
}
