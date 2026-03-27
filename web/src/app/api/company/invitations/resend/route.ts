import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireCompanyAccess } from "@/shared/lib/access";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";

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
  const server = await createSupabaseServerClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const redirectTo = appUrl
    ? `${appUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent("/app/dashboard")}&org=${encodeURIComponent(tenant.organizationId)}`
    : undefined;

  const existingUser = await findAuthUserByEmail(email);

  let mode: "invite" | "recovery" = "invite";

  if (existingUser) {
    const { error: otpError } = await server.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: redirectTo,
      },
    });

    if (otpError) {
      return NextResponse.json({ ok: false, error: `No se pudo reenviar correo de acceso: ${otpError.message}` }, { status: 400 });
    }

    mode = "recovery";
  } else {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        login_email: email,
      },
    });

    if (inviteError) {
      return NextResponse.json({ ok: false, error: `No se pudo reenviar invitación: ${inviteError.message}` }, { status: 400 });
    }
  }

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
    message: mode === "recovery" ? `Correo de acceso reenviado a ${email}` : `Invitación reenviada a ${email}`,
  });
}
