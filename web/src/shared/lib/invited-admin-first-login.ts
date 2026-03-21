import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { logAuditEvent } from "@/shared/lib/audit";

export async function markInvitedAdminFirstLoginIfNeeded(input: {
  organizationId: string;
  userId: string;
  email: string | null | undefined;
}) {
  const email = input.email?.trim().toLowerCase();
  if (!email) return;

  const admin = createSupabaseAdminClient();
  const { data: invitation } = await admin
    .from("organization_invitations")
    .select("id, organization_id, email, first_login_completed_at")
    .eq("organization_id", input.organizationId)
    .eq("source", "superadmin")
    .eq("role_code", "company_admin")
    .contains("metadata", { mode: "superadmin_invite" })
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!invitation || invitation.first_login_completed_at) {
    return;
  }

  const firstLoginAt = new Date().toISOString();
  const { error } = await admin
    .from("organization_invitations")
    .update({
      first_login_completed_at: firstLoginAt,
      first_login_user_id: input.userId,
    })
    .eq("id", invitation.id)
    .is("first_login_completed_at", null);

  if (error) return;

  await logAuditEvent({
    action: "organization.invited_admin.first_login",
    entityType: "organization_invitation",
    entityId: invitation.id,
    organizationId: invitation.organization_id,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "medium",
    metadata: {
      invited_email: invitation.email,
      first_login_user_id: input.userId,
      first_login_completed_at: firstLoginAt,
      source: "tenant_access_guard",
    },
  });
}
