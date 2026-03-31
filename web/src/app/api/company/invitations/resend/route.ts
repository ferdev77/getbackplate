import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireCompanyAccess } from "@/shared/lib/access";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { sendEmail } from "@/shared/lib/brevo";
import { getCanonicalAppUrl } from "@/shared/lib/app-url";
import { getTenantEmailBranding } from "@/shared/lib/email-branding";
import { resendReminderTemplate } from "@/shared/lib/email-templates/invitation";
import { buildTenantAuthUrls } from "@/shared/lib/tenant-auth-branding";
import { isUserMemberOfOrganization } from "@/shared/lib/tenant-membership";

export async function POST(request: Request) {
  const tenant = await requireCompanyAccess();

  const body = (await request.json().catch(() => null)) as
    | { email?: string; fullName?: string; roleCode?: string }
    | null;

  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.fullName ?? "").trim() || "Usuario";
  const roleCode = String(body?.roleCode ?? "employee").trim();

  if (!email) {
    return NextResponse.json({ ok: false, error: "Falta el email para reenviar invitación" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const appUrl = getCanonicalAppUrl();
  const branding = await getTenantEmailBranding(tenant.organizationId);

  const existingUser = await findAuthUserByEmail(email);
  if (!existingUser) {
    await logAuditEvent({
      action: "organization.invitation.resend",
      entityType: "organization_invitation",
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "denied",
      severity: "medium",
      metadata: {
        email,
        reason: "auth_user_not_found",
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: "No existe una cuenta para este correo. Crea el usuario desde el alta y luego reintenta.",
      },
      { status: 404 },
    );
  }

  const isMember = await isUserMemberOfOrganization({
    supabase: admin,
    organizationId: tenant.organizationId,
    userId: existingUser.id,
  });

  if (!isMember) {
    await logAuditEvent({
      action: "organization.invitation.resend",
      entityType: "organization_invitation",
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "denied",
      severity: "high",
      metadata: {
        email,
        reason: "cross_tenant_credentials_update_blocked",
      },
    });

    return NextResponse.json(
      {
        ok: false,
        error: "Este correo existe en otra empresa. Para seguridad, usa el alta normal para invitarlo a esta empresa sin tocar su acceso global.",
      },
      { status: 403 },
    );
  }

  const currentMetadata =
    existingUser.user_metadata && typeof existingUser.user_metadata === "object"
      ? (existingUser.user_metadata as Record<string, unknown>)
      : {};

  const { error: updateError } = await admin.auth.admin.updateUserById(existingUser.id, {
    email_confirm: true,
    user_metadata: {
      ...currentMetadata,
      full_name: fullName,
      force_password_change: true,
      temporary_password_set_at: new Date().toISOString(),
    },
  });

  if (updateError) {
    return NextResponse.json(
      { ok: false, error: `No se pudo actualizar la cuenta para reenvio: ${updateError.message}` },
      { status: 400 },
    );
  }

  const { loginUrl, recoveryUrl } = await buildTenantAuthUrls({
    appUrl,
    organizationId: tenant.organizationId,
    includeRecovery: true,
  });

  const emailResult = await sendEmail({
    to: [{ email, name: fullName }],
    subject: "Recordatorio de acceso a la plataforma",
    htmlContent: resendReminderTemplate({
      fullName,
      loginUrl,
      recoveryUrl: recoveryUrl ?? `${appUrl}/auth/forgot-password`,
      branding,
    }),
  });

  if (!emailResult.ok) {
    await logAuditEvent({
      action: "organization.invitation.resend",
      entityType: "organization_invitation",
      organizationId: tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: {
        email,
        reason: "email_delivery_failed",
        provider: "brevo",
        error: emailResult.error,
      },
    });

    return NextResponse.json({ ok: false, error: emailResult.error }, { status: 400 });
  }

  const mode = "recovery" as const;

  const code = crypto.randomUUID();
  await admin.from("organization_invitations").insert({
    organization_id: tenant.organizationId,
    email,
    full_name: fullName,
    role_code: roleCode,
    status: "sent",
    invitation_code: code,
    source: "company_panel",
    metadata: { mode },
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  });

  await logAuditEvent({
    action: "organization.invitation.resend",
    entityType: "organization_invitation",
    organizationId: tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: { email, mode },
  });

  return NextResponse.json({
    ok: true,
    mode,
    message: `Recordatorio de acceso reenviado a ${email}`,
  });
}
