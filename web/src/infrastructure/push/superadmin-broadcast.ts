import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg } from "./send-to-org";

export type SuperadminBroadcastInput = {
  title: string;
  body: string;
  image?: string;
  orgIds: "all" | string[];
  sentBy: string;
};

export type SuperadminBroadcastResult = {
  sent: number;
  expired: number;
  failed: number;
  orgs: number;
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
  const targetOrgIds = await resolveTargetOrgIds(supabase, input.orgIds);

  if (targetOrgIds.length === 0) {
    return { sent: 0, expired: 0, failed: 0, orgs: 0 };
  }

  const results = await Promise.allSettled(
    targetOrgIds.map((orgId) =>
      sendPushToOrg(orgId, {
        title: input.title,
        body: input.body,
        url: "/",
        ...(input.image ? { image: input.image } : {}),
      }),
    ),
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
    org_ids: targetOrgIds,
    orgs_count: targetOrgIds.length,
    sent,
    expired,
    failed,
  });
  if (logError) console.error("[push/superadmin-broadcast] Error guardando log:", logError.message);

  return { sent, expired, failed, orgs: targetOrgIds.length };
}
