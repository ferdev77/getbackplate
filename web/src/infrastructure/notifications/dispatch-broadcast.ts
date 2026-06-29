import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg, sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";

export type NotificationBroadcastChannel = "push" | "email";

export type DispatchNotificationBroadcastInput = {
  channels: NotificationBroadcastChannel[];
  title: string;
  body: string;
  imageUrl?: string;
  actionUrl?: string;
  createdBy: string;
} & (
  | { targetType: "orgs"; orgIds: "all" | string[] }
  | { targetType: "users"; userIds: string[] }
);

export type DispatchNotificationBroadcastResult = {
  targetType: "orgs" | "users";
  targetCount: number;
  pushSent: number;
  pushExpired: number;
  pushFailed: number;
  emailSent: number;
  emailFailed: number;
};

export async function resolveTargetOrgIds(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  orgIds: "all" | string[],
): Promise<string[]> {
  if (orgIds !== "all") return orgIds;

  const { data, error } = await supabase.from("organizations").select("id").eq("status", "active");
  if (error) throw new Error(`Error leyendo organizaciones: ${error.message}`);
  return (data ?? []).map((o) => o.id);
}

async function resolveBroadcastEmails(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: DispatchNotificationBroadcastInput,
): Promise<string[]> {
  if (input.targetType === "users") {
    const emailByUserId = await getAuthEmailByUserId(input.userIds);
    return [...new Set([...emailByUserId.values()])];
  }

  const targetOrgIds = await resolveTargetOrgIds(supabase, input.orgIds);
  if (!targetOrgIds.length) return [];

  const { data } = await supabase
    .from("organization_user_profiles")
    .select("email")
    .in("organization_id", targetOrgIds)
    .not("email", "is", null);

  return [...new Set((data ?? []).map((row) => row.email).filter((email): email is string => Boolean(email)))];
}

export async function dispatchNotificationBroadcast(
  input: DispatchNotificationBroadcastInput,
): Promise<DispatchNotificationBroadcastResult> {
  const supabase = createSupabaseAdminClient();

  let pushSent = 0;
  let pushExpired = 0;
  let pushFailed = 0;
  let emailSent = 0;
  let emailFailed = 0;
  let targetCount = 0;

  if (input.targetType === "users") {
    targetCount = input.userIds.length;
  } else {
    targetCount = (await resolveTargetOrgIds(supabase, input.orgIds)).length;
  }

  if (input.channels.includes("push")) {
    const payload = {
      title: input.title,
      body: input.body,
      url: input.actionUrl ?? "/",
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
    };

    if (input.targetType === "users") {
      const result = await sendPushToUsers(input.userIds, payload, {
        source: "superadmin_broadcast",
        createdBy: input.createdBy,
      });
      pushSent = result.sent;
      pushExpired = result.expired;
      pushFailed = result.failed;
    } else {
      const targetOrgIds = await resolveTargetOrgIds(supabase, input.orgIds);
      const results = await Promise.allSettled(
        targetOrgIds.map((orgId) =>
          sendPushToOrg(orgId, payload, {
            source: "superadmin_broadcast",
            organizationId: orgId,
            createdBy: input.createdBy,
          }),
        ),
      );
      for (const result of results) {
        if (result.status === "fulfilled") {
          pushSent += result.value.sent;
          pushExpired += result.value.expired;
          pushFailed += result.value.failed;
        } else {
          pushFailed += 1;
        }
      }
    }
  }

  if (input.channels.includes("email")) {
    const emails = await resolveBroadcastEmails(supabase, input);
    const results = await Promise.allSettled(
      emails.map((email) =>
        sendTransactionalEmail({
          to: email,
          subject: input.title,
          html: `<p>${input.body.replace(/\n/g, "<br/>")}</p>`,
          text: input.body,
          notification: {
            source: "superadmin_broadcast",
            actionUrl: input.actionUrl ?? null,
            title: input.title,
            createdBy: input.createdBy,
          },
        }),
      ),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.ok) {
        emailSent += 1;
      } else {
        emailFailed += 1;
      }
    }
  }

  return {
    targetType: input.targetType,
    targetCount,
    pushSent,
    pushExpired,
    pushFailed,
    emailSent,
    emailFailed,
  };
}
