import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg, sendPushToUsers } from "./send-to-org";

export type SuperadminBroadcastInput = {
  title: string;
  body: string;
  image?: string;
  sentBy: string;
} & (
  | { targetType: "orgs"; orgIds: "all" | string[] }
  | { targetType: "users"; userIds: string[] }
);

export type SuperadminBroadcastResult = {
  sent: number;
  expired: number;
  failed: number;
  targetType: "orgs" | "users";
  targetCount: number;
};

export async function resolveTargetOrgIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orgIds: "all" | string[],
): Promise<string[]> {
  if (orgIds !== "all") return orgIds;

  const { data, error } = await supabase
    .from("organizations")
    .select("id")
    .eq("status", "active");
  if (error) throw new Error(`Error leyendo organizaciones: ${error.message}`);
  return (data ?? []).map((o) => o.id);
}

export async function dispatchSuperadminPushBroadcast(
  input: SuperadminBroadcastInput,
): Promise<SuperadminBroadcastResult> {
  const supabase = createSupabaseAdminClient();
  const payload = {
    title: input.title,
    body: input.body,
    url: "/",
    ...(input.image ? { image: input.image } : {}),
  };

  if (input.targetType === "users") {
    const { sent, expired, failed } = await sendPushToUsers(input.userIds, payload);

    const { error: logError } = await supabase.from("push_send_logs").insert({
      sent_by: input.sentBy,
      title: input.title,
      body: input.body,
      image_url: input.image ?? null,
      target_type: "users",
      user_ids: input.userIds,
      user_count: input.userIds.length,
      org_ids: [],
      orgs_count: 0,
      sent,
      expired,
      failed,
    });
    if (logError) console.error("[push/superadmin-broadcast] Error guardando log:", logError.message);

    return { sent, expired, failed, targetType: "users", targetCount: input.userIds.length };
  }

  const targetOrgIds = await resolveTargetOrgIds(supabase, input.orgIds);

  if (targetOrgIds.length === 0) {
    return { sent: 0, expired: 0, failed: 0, targetType: "orgs", targetCount: 0 };
  }

  const results = await Promise.allSettled(
    targetOrgIds.map((orgId) => sendPushToOrg(orgId, payload)),
  );

  let sent = 0;
  let expired = 0;
  let failed = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      sent += result.value.sent;
      expired += result.value.expired;
      failed += result.value.failed;
    } else {
      failed++;
    }
  }

  const { error: logError } = await supabase.from("push_send_logs").insert({
    sent_by: input.sentBy,
    title: input.title,
    body: input.body,
    image_url: input.image ?? null,
    target_type: "orgs",
    org_ids: targetOrgIds,
    orgs_count: targetOrgIds.length,
    user_ids: [],
    user_count: 0,
    sent,
    expired,
    failed,
  });
  if (logError) console.error("[push/superadmin-broadcast] Error guardando log:", logError.message);

  return { sent, expired, failed, targetType: "orgs", targetCount: targetOrgIds.length };
}
