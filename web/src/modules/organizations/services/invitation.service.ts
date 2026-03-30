import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { sendEmail } from "@/shared/lib/brevo";
import { getTenantEmailBranding } from "@/shared/lib/email-branding";
import { initialInviteTemplate } from "@/shared/lib/email-templates/invitation";
import { buildTenantAuthUrls } from "@/shared/lib/tenant-auth-branding";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomPassword() {
  return `Gb!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}A9`;
}

function invitationCode() {
  return crypto.randomUUID();
}

export function buildTemporaryPasswordMetadata(
  base: unknown,
  fullName: string,
) {
  const current = base && typeof base === "object" ? (base as Record<string, unknown>) : {};
  return {
    ...current,
    full_name: fullName,
    force_password_change: true,
    temporary_password_set_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Role lookup
// ---------------------------------------------------------------------------

export async function getCompanyAdminRoleId() {
  const supabase = createSupabaseAdminClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "company_admin")
    .single();
  return role?.id ?? null;
}

// ---------------------------------------------------------------------------
// Invitation record
// ---------------------------------------------------------------------------

export async function createInvitationRecord(params: {
  organizationId: string;
  email: string;
  fullName: string;
  sentBy: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  const code = invitationCode();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();

  const { error } = await supabase.from("organization_invitations").insert({
    organization_id: params.organizationId,
    email: params.email,
    full_name: params.fullName,
    role_code: "company_admin",
    status: "sent",
    invitation_code: code,
    sent_by: params.sentBy,
    expires_at: expiresAt,
    source: "superadmin",
    metadata: params.metadata ?? {},
  });

  return error;
}

// ---------------------------------------------------------------------------
// Send Admin Invitation (full flow)
// ---------------------------------------------------------------------------

export async function sendOrganizationAdminInvitation(params: {
  organizationId: string;
  email: string;
  fullName: string;
  password?: string;
  activateMembership?: boolean;
  sentBy: string | null;
}) {
  const supabase = createSupabaseAdminClient();
  const roleId = await getCompanyAdminRoleId();
  if (!roleId) {
    return { ok: false as const, message: "No se encontro rol company_admin" };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const { loginUrl } = await buildTenantAuthUrls({
    appUrl,
    organizationId: params.organizationId,
  });
  const branding = await getTenantEmailBranding(params.organizationId);

  const existingUser = await findAuthUserByEmail(params.email);
  let userId = existingUser?.id ?? null;
  let deliveryMode: "invite" | "recovery" = "invite";
  const userPassword = params.password || randomPassword();

  if (userId) {
    const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
      password: userPassword,
      email_confirm: true,
      user_metadata: buildTemporaryPasswordMetadata(existingUser?.user_metadata, params.fullName),
    });
    
    if (updateError) {
      return { ok: false as const, message: updateError.message };
    }

    try {
      await sendEmail({
        to: [{ email: params.email, name: params.fullName }],
        subject: "Tus credenciales de acceso a GetBackplate",
        htmlContent: initialInviteTemplate({
          fullName: params.fullName,
          loginEmail: params.email,
          loginPassword: userPassword,
          loginUrl,
          branding,
        }),
      });
      deliveryMode = "recovery";
      await logAuditEvent({
        action: "organization.invitation.fallback_recovery.sent",
        entityType: "organization_invitation",
        organizationId: params.organizationId,
        eventDomain: "superadmin",
        outcome: "success",
        severity: "low",
        metadata: {
          email: params.email,
          reason: "existing_user",
        },
      });
    } catch (recoveryError: unknown) {
      const recoveryMessage = recoveryError instanceof Error ? recoveryError.message : "Error";
      await logAuditEvent({
        action: "organization.invitation.fallback_recovery.failed",
        entityType: "organization_invitation",
        organizationId: params.organizationId,
        eventDomain: "superadmin",
        outcome: "error",
        severity: "medium",
        metadata: {
          email: params.email,
          error: recoveryMessage,
          reason: "existing_user",
        },
      });
      return { ok: false as const, message: `No se pudo enviar correo de acceso: ${recoveryMessage}` };
    }
  } else {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: params.email,
      password: userPassword,
      email_confirm: true,
      user_metadata: buildTemporaryPasswordMetadata(undefined, params.fullName),
    });

    if (createError || !created.user?.id) {
      return { ok: false as const, message: createError?.message ?? "Error desconocido al crear usuario" };
    }

    userId = created.user.id;

    try {
      await sendEmail({
        to: [{ email: params.email, name: params.fullName }],
        subject: "Bienvenido(a) a GetBackplate - Tus credenciales",
        htmlContent: initialInviteTemplate({
          fullName: params.fullName,
          loginEmail: params.email,
          loginPassword: userPassword,
          loginUrl,
          branding,
        }),
      });
    } catch (inviteError: unknown) {
      const inviteMessage = inviteError instanceof Error ? inviteError.message : "Error";
      await logAuditEvent({
        action: "organization.invitation.fallback_recovery.sent",
        entityType: "organization_invitation",
        organizationId: params.organizationId,
        eventDomain: "superadmin",
        outcome: "error",
        severity: "medium",
        metadata: {
          email: params.email,
          reason: "invite_error",
          invite_error: inviteMessage,
        },
      });
      return {
        ok: false as const,
        message: `Usuario creado pero fallo envio de correo: ${inviteMessage}`,
      };
    }
  }

  if (!userId) {
    return { ok: false as const, message: "No se pudo resolver usuario invitado" };
  }

  const { error: membershipError } = await supabase.from("memberships").upsert(
    {
      organization_id: params.organizationId,
      user_id: userId,
      role_id: roleId,
      status: params.activateMembership ? "active" : "invited",
    },
    { onConflict: "organization_id,user_id" },
  );

  if (membershipError) {
    return { ok: false as const, message: membershipError.message };
  }

  const invitationError = await createInvitationRecord({
    organizationId: params.organizationId,
    email: params.email,
    fullName: params.fullName,
    sentBy: params.sentBy,
    metadata: { mode: "superadmin_invite" },
  });

  if (invitationError) {
    return { ok: false as const, message: `No se pudo guardar invitacion: ${invitationError.message}` };
  }

  await logAuditEvent({
    action: "organization.invitation.send",
    entityType: "organization_invitation",
    organizationId: params.organizationId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "medium",
    metadata: {
      email: params.email,
      role: "company_admin",
      membership_status: params.activateMembership ? "active" : "invited",
      fallback_recovery_enabled: true,
    },
  });

  return { ok: true as const, mode: deliveryMode };
}
