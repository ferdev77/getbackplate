import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireSuperadmin } from "@/shared/lib/access";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { sendEmail } from "@/shared/lib/brevo";
import { getTenantEmailBranding } from "@/shared/lib/email-branding";
import { resendReminderTemplate } from "@/shared/lib/email-templates/invitation";

export async function POST(request: Request) {
  await requireSuperadmin();

  const body = (await request.json().catch(() => null)) as
    | { organizationId?: string; email?: string; fullName?: string }
    | null;

  const organizationId = String(body?.organizationId ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const fullName = String(body?.fullName ?? "").trim() || "Administrador";

  if (!organizationId || !email) {
    return NextResponse.json({ ok: false, error: "Faltan datos para reenviar invitación" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com";
  const branding = await getTenantEmailBranding(organizationId);

  const existingUser = await findAuthUserByEmail(email);
  if (!existingUser) {
    await logAuditEvent({
      action: "organization.invitation.resend",
      entityType: "organization_invitation",
      organizationId,
      eventDomain: "superadmin",
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
        error: "No existe una cuenta para este correo. Crea el admin desde alta y luego reintenta.",
      },
      { status: 404 },
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

  const loginUrl = `${appUrl.replace(/\/$/, "")}/auth/login?org=${encodeURIComponent(organizationId)}`;
  const recoveryUrl = `${appUrl.replace(/\/$/, "")}/auth/forgot-password?org=${encodeURIComponent(organizationId)}`;

  const emailResult = await sendEmail({
    to: [{ email, name: fullName }],
    subject: "Recordatorio de acceso a la plataforma",
    htmlContent: resendReminderTemplate({ fullName, loginUrl, recoveryUrl, branding })
  });

  if (!emailResult.ok) {
    await logAuditEvent({
      action: "organization.invitation.resend",
      entityType: "organization_invitation",
      organizationId,
      eventDomain: "superadmin",
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
    organization_id: organizationId,
    email,
    full_name: fullName,
    role_code: "company_admin",
    status: "sent",
    invitation_code: code,
    source: "superadmin",
    metadata: { mode },
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
  });

  await logAuditEvent({
    action: "organization.invitation.resend",
    entityType: "organization_invitation",
    organizationId,
    eventDomain: "superadmin",
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
