import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getCurrentUser } from "@/modules/memberships/queries";
import { NotificationBroadcastClient } from "./notification-broadcast-client";

export type Subscriber = {
  user_id: string;
  org_id: string | null;
  org_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  user_agent: string | null;
  created_at: string;
};

export default async function SuperadminNotificationsPage() {
  const supabase = createSupabaseAdminClient();
  const currentUser = await getCurrentUser();

  const [{ data: orgs }, { data: logs }, { data: rawSubs }, { data: scheduled }, { data: ownAlertSubs }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name")
      .eq("status", "active")
      .order("name"),
    supabase
      .from("notification_broadcasts")
      .select("id, created_at, created_by, channels, title, body, image_url, target_type, org_ids, user_ids, status, push_sent, push_expired, push_failed, email_sent, email_failed")
      .in("status", ["sent", "failed"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("push_subscriptions")
      .select("user_id, org_id, user_agent, created_at")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("notification_broadcasts")
      .select("id, created_at, created_by, channels, title, body, image_url, target_type, target_all, org_ids, user_ids, scheduled_at, status")
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true }),
    currentUser
      ? supabase
          .from("push_subscriptions")
          .select("id")
          .eq("user_id", currentUser.id)
          .eq("notify_integration_alerts", true)
          .eq("is_active", true)
          .limit(1)
      : Promise.resolve({ data: [] }),
  ]);

  const userIds = Array.from(new Set((rawSubs ?? []).map((s) => s.user_id)));
  const orgIds = Array.from(new Set((rawSubs ?? []).map((s) => s.org_id).filter(Boolean)));

  const [{ data: profiles }, { data: subOrgs }] = await Promise.all([
    userIds.length > 0
      ? supabase
          .from("organization_user_profiles")
          .select("user_id, organization_id, first_name, last_name, email")
          .in("user_id", userIds)
          .in("organization_id", orgIds)
      : Promise.resolve({ data: [] }),
    orgIds.length > 0
      ? supabase.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] }),
  ]);

  const orgNameById = new Map((subOrgs ?? []).map((o) => [o.id, o.name]));
  const profileByOrgUser = new Map(
    (profiles ?? []).map((p) => [`${p.organization_id}:${p.user_id}`, p]),
  );

  // Fallback para admins y superadmins que no tienen fila en organization_user_profiles
  const foundUserIds = new Set((profiles ?? []).map((p) => p.user_id));
  const missingUserIds = [...new Set(userIds.filter((id) => !foundUserIds.has(id)))];
  const authUserById = new Map<string, { email: string | null; full_name: string | null }>();
  if (missingUserIds.length > 0) {
    const results = await Promise.all(
      missingUserIds.map((id) =>
        supabase.auth.admin
          .getUserById(id)
          .then(({ data }) => ({ id, user: data?.user ?? null }))
          .catch(() => ({ id, user: null })),
      ),
    );
    for (const { id, user } of results) {
      authUserById.set(id, {
        email: user?.email ?? null,
        full_name: (user?.user_metadata?.full_name as string | null) ?? null,
      });
    }
  }

  const subscribers: Subscriber[] = (rawSubs ?? []).map((sub) => {
    const profile = profileByOrgUser.get(`${sub.org_id}:${sub.user_id}`);
    const authFallback = !profile ? authUserById.get(sub.user_id) : null;
    const nameParts = authFallback?.full_name ? authFallback.full_name.trim().split(/\s+/) : [];
    return {
      user_id: sub.user_id,
      org_id: sub.org_id,
      org_name: sub.org_id ? (orgNameById.get(sub.org_id) ?? "—") : "Superadmin",
      first_name: profile?.first_name ?? nameParts[0] ?? null,
      last_name: profile?.last_name ?? (nameParts.slice(1).join(" ") || null),
      email: profile?.email ?? authFallback?.email ?? null,
      user_agent: sub.user_agent,
      created_at: sub.created_at,
    };
  });

  return (
    <NotificationBroadcastClient
      orgs={orgs ?? []}
      logs={logs ?? []}
      subscribers={subscribers}
      scheduled={scheduled ?? []}
      integrationAlertsEnabled={(ownAlertSubs ?? []).length > 0}
    />
  );
}
