import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const callbackRedirectTo = appUrl
    ? `${appUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent("/app/dashboard")}&org=${encodeURIComponent(params.organizationId)}`
    : undefined;

  async function sendAccessEmail(email: string) {
    const server = await createSupabaseServerClient();
    const { error: otpError } = await server.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: callbackRedirectTo,
      },
    });

    if (!otpError) {
      return null;
    }

    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(
      email,
      callbackRedirectTo ? { redirectTo: callbackRedirectTo } : undefined,
    );

    return recoveryError ?? otpError;
  }

  const existingUser = await findAuthUserByEmail(params.email);
  let userId = existingUser?.id ?? null;
  let deliveryMode: "invite" | "recovery" = "invite";

  if (userId) {
    if (params.password) {
      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: params.password,
        email_confirm: true,
        user_metadata: buildTemporaryPasswordMetadata(existingUser?.user_metadata, params.fullName),
      });
      if (updateError) {
        return { ok: false as const, message: updateError.message };
      }
    }

    const recoveryError = await sendAccessEmail(params.email);
    if (recoveryError) {
      await logAuditEvent({
        action: "organization.invitation.fallback_recovery.failed",
        entityType: "organization_invitation",
        organizationId: params.organizationId,
        eventDomain: "superadmin",
        outcome: "error",
        severity: "medium",
        metadata: {
          email: params.email,
          error: recoveryError.message,
          reason: "existing_user",
        },
      });
      return { ok: false as const, message: `No se pudo enviar correo de acceso: ${recoveryError.message}` };
    } else {
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
    }
  }

  if (!userId) {
    const inviteOptions: {
      redirectTo?: string;
      data: Record<string, unknown>;
    } = {
      data: {
        full_name: params.fullName,
        login_email: params.email,
        login_password: params.password ?? "",
      },
    };

    if (callbackRedirectTo) {
      inviteOptions.redirectTo = callbackRedirectTo;
    }

    const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      params.email,
      inviteOptions,
    );

    if (inviteError) {
      const recoveryError = await sendAccessEmail(params.email);
      if (!recoveryError) {
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
            reason: "invite_error",
            invite_error: inviteError.message,
          },
        });
      }

      if (!recoveryError) {
        return {
          ok: true as const,
          mode: "recovery" as const,
          message: "Invite no disponible; se envio correo de recuperacion.",
        };
      }

      return {
        ok: false as const,
        message: `${inviteError.message}. Fallback recovery fallo: ${recoveryError.message}`,
      };
    }

    userId = invited.user?.id ?? null;

    if (userId && params.password) {
      await supabase.auth.admin.updateUserById(userId, {
        password: params.password,
        email_confirm: true,
        user_metadata: buildTemporaryPasswordMetadata(invited.user?.user_metadata, params.fullName),
      });
    }

    if (!userId) {
      const tempPassword = randomPassword();
      const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
        email: params.email,
        password: params.password ?? tempPassword,
        email_confirm: false,
        user_metadata: buildTemporaryPasswordMetadata(undefined, params.fullName),
      });
      if (createError) {
        return { ok: false as const, message: createError.message };
      }
      userId = createdUser.user?.id ?? null;
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
