import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { sendEmail } from "@/shared/lib/brevo";
import { initialInviteTemplate, resendReminderTemplate } from "@/shared/lib/email-templates/invitation";

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
  const server = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://getbackplate.com";
  const redirectTo = `${appUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent("/app/dashboard")}&org=${encodeURIComponent(organizationId)}`;

  const existingUser = await findAuthUserByEmail(email);

  let mode: "invite" | "recovery" = "invite";

  if (existingUser) {
    const loginUrl = `${appUrl.replace(/\/$/, "")}/auth/login`;
    const recoveryUrl = `${appUrl.replace(/\/$/, "")}/auth/forgot-password`;

    const emailResult = await sendEmail({
      to: [{ email, name: fullName }],
      subject: "Recordatorio de acceso a la plataforma",
      htmlContent: resendReminderTemplate({ fullName, loginUrl, recoveryUrl })
    });

    if (!emailResult.ok) {
      return NextResponse.json({ ok: false, error: emailResult.error }, { status: 400 });
    }

    mode = "recovery";
  } else {
    function randomPassword() {
      return `Gb!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}A9`;
    }
    const tempPassword = randomPassword();
    
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        force_password_change: true,
        temporary_password_set_at: new Date().toISOString(),
      },
    });

    if (createError || !created.user) {
      return NextResponse.json({ ok: false, error: `No se pudo reenviar invitación: ${createError?.message}` }, { status: 400 });
    }

    const loginUrl = `${appUrl.replace(/\/$/, "")}/auth/login`;

    const emailResult = await sendEmail({
      to: [{ email, name: fullName }],
      subject: "Bienvenido(a) a GetBackplate - Tus credenciales",
      htmlContent: initialInviteTemplate({
        fullName,
        loginEmail: email,
        loginPassword: tempPassword,
        loginUrl,
      })
    });

    if (!emailResult.ok) {
      return NextResponse.json({ ok: false, error: emailResult.error }, { status: 400 });
    }
  }

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
    message: mode === "recovery" ? `Correo de acceso reenviado a ${email}` : `Invitación reenviada a ${email}`,
  });
}
