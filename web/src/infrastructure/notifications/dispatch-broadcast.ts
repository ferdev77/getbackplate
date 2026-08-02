import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToOrg, sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { userIdParaEmailSinDuplicarCampanita } from "@/shared/lib/notification-recipients";

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

/**
 * A quien se le manda el email, con su usuario cuando se conoce.
 *
 * El usuario hace falta para no repetirle la campanita a quien tambien recibe
 * el push de esta misma difusion (ver userIdParaEmailSinDuplicarCampanita).
 */
type DestinatarioDeEmail = { email: string; userId: string | null };

async function resolveBroadcastEmails(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: DispatchNotificationBroadcastInput,
): Promise<DestinatarioDeEmail[]> {
  if (input.targetType === "users") {
    const emailByUserId = await getAuthEmailByUserId(input.userIds);
    const porEmail = new Map<string, string>();
    for (const [userId, email] of emailByUserId) {
      if (email && !porEmail.has(email)) porEmail.set(email, userId);
    }
    return [...porEmail].map(([email, userId]) => ({ email, userId }));
  }

  const targetOrgIds = await resolveTargetOrgIds(supabase, input.orgIds);
  if (!targetOrgIds.length) return [];

  const { data } = await supabase
    .from("organization_user_profiles")
    .select("email, user_id")
    .in("organization_id", targetOrgIds)
    .not("email", "is", null);

  const porEmail = new Map<string, string | null>();
  for (const row of data ?? []) {
    if (!row.email || porEmail.has(row.email)) continue;
    porEmail.set(row.email, row.user_id ?? null);
  }
  return [...porEmail].map(([email, userId]) => ({ email, userId }));
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

  // A quien ya le dejo su fila en la campanita el push de esta difusion. El
  // email de mas abajo no se la repite: seria el mismo aviso dos veces.
  const alcanzadosPorPush = new Set<string>();

  if (input.channels.includes("push")) {
    const payload = {
      title: input.title,
      body: input.body,
      url: input.actionUrl ?? "/",
      ...(input.imageUrl ? { image: input.imageUrl } : {}),
    };

    if (input.targetType === "users") {
      for (const userId of input.userIds) alcanzadosPorPush.add(userId);
      const result = await sendPushToUsers(input.userIds, payload, {
        source: "superadmin_broadcast",
        createdBy: input.createdBy,
      });
      pushSent = result.sent;
      pushExpired = result.expired;
      pushFailed = result.failed;
    } else {
      const targetOrgIds = await resolveTargetOrgIds(supabase, input.orgIds);

      // sendPushToOrg resuelve los miembros por dentro pero no los devuelve:
      // se consultan igual, con el mismo criterio, para saber a quien alcanzo.
      if (targetOrgIds.length) {
        const { data: miembros } = await supabase
          .from("memberships")
          .select("user_id")
          .in("organization_id", targetOrgIds)
          .eq("status", "active");
        for (const fila of miembros ?? []) {
          if (fila.user_id) alcanzadosPorPush.add(fila.user_id);
        }
      }

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
    const destinatarios = await resolveBroadcastEmails(supabase, input);
    const results = await Promise.allSettled(
      destinatarios.map(({ email, userId }) =>
        sendTransactionalEmail({
          to: email,
          subject: input.title,
          html: `<p>${input.body.replace(/\n/g, "<br/>")}</p>`,
          text: input.body,
          notification: {
            source: "superadmin_broadcast",
            userId: userIdParaEmailSinDuplicarCampanita(userId, alcanzadosPorPush),
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
