import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { USERS_API_MESSAGES } from "@/shared/lib/employees-messages";
import { assertPlanLimitForUsers, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { sendEmail } from "@/shared/lib/brevo";
import { initialInviteTemplate } from "@/shared/lib/email-templates/invitation";
const ALLOWED_ROLE_CODES = new Set(["employee", "manager", "company_admin"]);
const ALLOWED_STATUSES = new Set(["active", "inactive"]);

function isAuthUserAlreadyRegisteredError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("already") || normalized.includes("exists") || normalized.includes("registered");
}

async function resolveOrCreateAuthUser(params: {
  email: string;
  password: string;
  fullName: string;
}) {
  const admin = createSupabaseAdminClient();
  const existingUser = await findAuthUserByEmail(params.email);
  let userId = existingUser?.id ?? null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  const loginUrl = `${appUrl.replace(/\/$/, "")}/auth/login`;

  const userMeta = {
    full_name: params.fullName,
    force_password_change: true,
    temporary_password_set_at: new Date().toISOString(),
  };

  if (userId) {
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
      password: params.password,
      email_confirm: true,
      user_metadata: {
        ...(existingUser?.user_metadata || {}),
        ...userMeta,
      },
    });

    if (updateError) {
      return { userId: null, errorMessage: `Error actualizando credenciales: ${updateError.message}` };
    }

    try {
      await sendEmail({
        to: [{ email: params.email, name: params.fullName }],
        subject: "Tus credenciales de acceso a GetBackplate",
        htmlContent: initialInviteTemplate({
          fullName: params.fullName,
          loginEmail: params.email,
          loginPassword: params.password,
          loginUrl,
        }),
      });
    } catch (e) {
      console.error("Error sending invite email for existing user:", e);
    }
    
    return { userId, errorMessage: null };
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: {
      full_name: params.fullName,
      force_password_change: true,
      temporary_password_set_at: new Date().toISOString(),
    },
  });

  if (createError || !created.user?.id) {
    return { userId: null, errorMessage: `No se pudo enviar invitacion: ${createError?.message ?? "Error desconocido"}` };
  }

  userId = created.user.id;

  try {
    await sendEmail({
      to: [{ email: params.email, name: params.fullName }],
      subject: "Bienvenido(a) a GetBackplate - Tus credenciales",
      htmlContent: initialInviteTemplate({
        fullName: params.fullName,
        loginEmail: params.email,
        loginPassword: params.password,
        loginUrl,
      }),
    });
  } catch (e) {
    console.error("Error sending invite email for new user:", e);
  }

  return { userId, errorMessage: null };
}

async function requireUserContext() {
  const moduleAccess = await assertCompanyManagerModuleApi("employees");
  if (!moduleAccess.ok) {
    return {
      error: NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status }),
    };
  }

  const tenant = moduleAccess.tenant;
  const supabase = await createSupabaseServerClient();
  const userId = moduleAccess.userId;

  return { supabase, tenant, userId };
}

export async function PATCH(request: Request) {
  const context = await requireUserContext();
  if ("error" in context) {
    return context.error;
  }

  const { supabase, tenant, userId } = context;
  const body = await request.json().catch(() => null) as
    | { membershipId?: string; roleCode?: string; status?: string; branchId?: string | null }
    | null;

  const membershipId = String(body?.membershipId ?? "").trim();
  const roleCode = String(body?.roleCode ?? "").trim();
  const status = String(body?.status ?? "").trim();
  const branchId = body?.branchId ? String(body.branchId).trim() : null;

  if (!membershipId) {
    return NextResponse.json({ error: USERS_API_MESSAGES.MEMBERSHIP_INVALID }, { status: 400 });
  }

  if (!ALLOWED_ROLE_CODES.has(roleCode)) {
    return NextResponse.json({ error: USERS_API_MESSAGES.ROLE_INVALID }, { status: 400 });
  }

  if (!ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: USERS_API_MESSAGES.STATUS_INVALID }, { status: 400 });
  }

  const { data: previousMembership } = await supabase
    .from("memberships")
    .select("status, role_id, branch_id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", membershipId)
    .maybeSingle();

  if (!previousMembership) {
    return NextResponse.json({ error: USERS_API_MESSAGES.MEMBERSHIP_INVALID }, { status: 404 });
  }

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle();

  if (roleError || !role) {
    return NextResponse.json({ error: USERS_API_MESSAGES.ROLE_RESOLUTION_FAILED }, { status: 400 });
  }

  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle();

    if (!branch) {
      return NextResponse.json({ error: USERS_API_MESSAGES.LOCATION_INVALID }, { status: 400 });
    }
  }

  const { error: updateError } = await supabase
    .from("memberships")
    .update({ role_id: role.id, status, branch_id: branchId })
    .eq("organization_id", tenant.organizationId)
    .eq("id", membershipId);

  if (updateError) {
    await logAuditEvent({
      action: "users.membership.update",
      entityType: "membership",
      entityId: membershipId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "medium",
      metadata: {
        actor_user_id: userId,
        role_code: roleCode,
        status,
        branch_id: branchId,
        error: updateError.message,
      },
    });
    return NextResponse.json(
      { error: `${USERS_API_MESSAGES.USER_UPDATE_FAILED_PREFIX}: ${updateError.message}` },
      { status: 400 },
    );
  }

  await logAuditEvent({
    action: "users.membership.update",
    entityType: "membership",
    entityId: membershipId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: userId,
      role_code: roleCode,
      status,
      branch_id: branchId,
      previous_status: previousMembership?.status ?? null,
      status_changed: previousMembership?.status !== status,
    },
  });

  if (previousMembership?.status !== status) {
    await logAuditEvent({
      action: "membership.status.update",
      entityType: "membership",
      entityId: membershipId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      metadata: {
        actor_user_id: userId,
        status_scope: "acceso",
        previous_status: previousMembership?.status ?? null,
        next_status: status,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const context = await requireUserContext();
  if ("error" in context) {
    return context.error;
  }

  const { supabase, tenant, userId } = context;
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleCodeInput = String(formData.get("role_code") ?? "employee").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  const accessStatusRaw = String(formData.get("access_status") ?? "active").trim().toLowerCase();
  const accessStatus = accessStatusRaw === "inactive" || accessStatusRaw === "inactivo" ? "inactive" : "active";

  if (!fullName || !email) {
    return NextResponse.json({ error: "Nombre completo y correo corporativo son obligatorios" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "La contrasena debe tener al menos 8 caracteres" }, { status: 400 });
  }

  const roleCode = ALLOWED_ROLE_CODES.has(roleCodeInput) ? roleCodeInput : "employee";

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", roleCode)
    .maybeSingle();

  if (roleError || !role) {
    return NextResponse.json({ error: USERS_API_MESSAGES.ROLE_RESOLUTION_FAILED }, { status: 400 });
  }

  if (branchId) {
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .eq("is_active", true)
      .maybeSingle();

    if (!branch) {
      return NextResponse.json({ error: USERS_API_MESSAGES.LOCATION_INVALID }, { status: 400 });
    }
  }

  const authResult = await resolveOrCreateAuthUser({
    email,
    password,
    fullName,
  });

  if (!authResult.userId) {
    return NextResponse.json({ error: authResult.errorMessage ?? "No se pudo resolver el usuario" }, { status: 400 });
  }

  const targetUserId = authResult.userId;
  const admin = createSupabaseAdminClient();

  const { data: existingMembership } = await admin
    .from("memberships")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!existingMembership) {
    try {
      await assertPlanLimitForUsers(tenant.organizationId, 1);
    } catch (error) {
      return NextResponse.json(
        { error: getPlanLimitErrorMessage(error, "No puedes crear mas usuarios con tu plan actual") },
        { status: 400 },
      );
    }
  }

  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .upsert(
      {
        organization_id: tenant.organizationId,
        user_id: targetUserId,
        role_id: role.id,
        branch_id: branchId,
        status: accessStatus,
      },
      { onConflict: "organization_id,user_id" },
    )
    .select("id")
    .single();

  if (membershipError || !membership) {
    return NextResponse.json(
      { error: `No se pudo crear usuario: ${membershipError?.message ?? "error"}` },
      { status: 400 },
    );
  }

  await logAuditEvent({
    action: "users.membership.create",
    entityType: "membership",
    entityId: membership.id,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "high",
    metadata: {
      actor_user_id: userId,
      target_user_id: targetUserId,
      full_name: fullName,
      email,
      role_code: roleCode,
      status: accessStatus,
      branch_id: branchId,
      was_existing_membership: Boolean(existingMembership),
    },
  });

  await logAuditEvent({
    action: "membership.status.update",
    entityType: "membership",
    entityId: membership.id,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: userId,
      status_scope: "acceso",
      previous_status: existingMembership ? "(existing)" : null,
      next_status: accessStatus,
    },
  });

  return NextResponse.json({ ok: true, membershipId: membership.id });
}

export async function DELETE(request: Request) {
  const context = await requireUserContext();
  if ("error" in context) {
    return context.error;
  }

  const { supabase, tenant, userId } = context;
  const body = await request.json().catch(() => null) as { membershipId?: string } | null;
  const membershipId = String(body?.membershipId ?? "").trim();

  if (!membershipId) {
    return NextResponse.json({ error: USERS_API_MESSAGES.MEMBERSHIP_INVALID }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", membershipId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: USERS_API_MESSAGES.MEMBERSHIP_INVALID }, { status: 404 });
  }

  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", membershipId);

  if (error) {
    await logAuditEvent({
      action: "users.membership.delete",
      entityType: "membership",
      entityId: membershipId,
      organizationId: tenant.organizationId,
      eventDomain: "employees",
      outcome: "error",
      severity: "high",
      metadata: {
        actor_user_id: userId,
        error: error.message,
      },
    });
    return NextResponse.json(
      { error: `${USERS_API_MESSAGES.USER_DELETE_FAILED_PREFIX}: ${error.message}` },
      { status: 400 },
    );
  }

  await logAuditEvent({
    action: "users.membership.delete",
    entityType: "membership",
    entityId: membershipId,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: userId,
    },
  });

  return NextResponse.json({ ok: true });
}
