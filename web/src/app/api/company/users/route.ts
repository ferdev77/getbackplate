import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { USERS_API_MESSAGES } from "@/shared/lib/employees-messages";
import { buildBrandedEmailSubject, getTenantEmailBranding, resolveEmailSenderName } from "@/shared/lib/email-branding";
import { getCanonicalAppUrl } from "@/shared/lib/app-url";
import { assertPlanLimitForUsers, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { buildTenantAuthUrls } from "@/shared/lib/tenant-auth-branding";
import { sendEmail } from "@/shared/lib/brevo";
import { initialInviteTemplate } from "@/shared/lib/email-templates/invitation";
import { resendReminderTemplate } from "@/shared/lib/email-templates/invitation";
import { isUserMemberOfOrganization } from "@/shared/lib/tenant-membership";
const ALLOWED_ROLE_CODES = new Set(["employee", "company_admin"]);
const ALLOWED_STATUSES = new Set(["active", "inactive"]);

async function resolveOrCreateAuthUser(params: {
  organizationId: string;
  email: string;
  password: string;
  fullName: string;
}) {
  const admin = createSupabaseAdminClient();
  const existingUser = await findAuthUserByEmail(params.email);
  let userId = existingUser?.id ?? null;

  const appUrl = getCanonicalAppUrl();
  const { loginUrl, recoveryUrl } = await buildTenantAuthUrls({
    appUrl,
    organizationId: params.organizationId,
    includeRecovery: true,
  });
  const branding = await getTenantEmailBranding(params.organizationId);

  const userMeta = {
    full_name: params.fullName,
    force_password_change: true,
    temporary_password_set_at: new Date().toISOString(),
  };

  if (userId) {
    const isMember = await isUserMemberOfOrganization({
      supabase: admin,
      organizationId: params.organizationId,
      userId,
    });

    if (!isMember) {
      try {
        await sendEmail({
          to: [{ email: params.email, name: params.fullName }],
          subject: buildBrandedEmailSubject("Acceso activado para la plataforma", branding),
          senderName: resolveEmailSenderName(branding),
          htmlContent: resendReminderTemplate({
            fullName: params.fullName,
            loginUrl,
            recoveryUrl: recoveryUrl ?? `${appUrl}/auth/forgot-password`,
            branding,
          }),
        });
      } catch (e) {
        console.error("Error sending cross-tenant join email:", e);
      }

      return { userId, errorMessage: null };
    }

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
        subject: buildBrandedEmailSubject("Tus credenciales de acceso", branding),
        senderName: resolveEmailSenderName(branding),
        htmlContent: initialInviteTemplate({
          fullName: params.fullName,
          loginEmail: params.email,
          loginPassword: params.password,
          loginUrl,
          branding,
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
      subject: buildBrandedEmailSubject("Bienvenido(a) - Tus credenciales", branding),
      senderName: resolveEmailSenderName(branding),
        htmlContent: initialInviteTemplate({
          fullName: params.fullName,
          loginEmail: params.email,
          loginPassword: params.password,
          loginUrl,
          branding,
        }),
      });
  } catch (e) {
    console.error("Error sending invite email for new user:", e);
  }

  return { userId, errorMessage: null };
}

async function requireUserContext() {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
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

export async function GET(request: Request) {
  const context = await requireUserContext();
  if ("error" in context) {
    return context.error;
  }

  const { supabase, tenant } = context;
  const url = new URL(request.url);
  const catalog = url.searchParams.get("catalog");
  if (catalog !== "create_modal" && catalog !== "list") {
    return NextResponse.json({ error: "Consulta no soportada" }, { status: 400 });
  }

  const [{ data: customBrandingEnabled }, { data: branches }] = await Promise.all([
    supabase.rpc("is_module_enabled", { org_id: tenant.organizationId, module_code: "custom_branding" }),
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const mappedBranches = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: customBrandingEnabled && branch.city ? branch.city : branch.name,
  }));

  if (catalog === "create_modal") {
    return NextResponse.json({
      branches: mappedBranches,
      roleOptions: [{ value: "company_admin", label: "Administrador" }],
    });
  }

  const viewData = await getEmployeeDirectoryView(tenant.organizationId, 120, 0, {
    includeEmployeesData: false,
    includeUsersTab: true,
  });

  type UserViewRow = { userId: string | null; branchName?: string | null; branchId?: string | null; [key: string]: unknown };
  const userRows = (viewData.users ?? []) as UserViewRow[];

  const userIds = Array.from(
    new Set(userRows.map((row) => row.userId).filter((value): value is string => Boolean(value))),
  );

  const { data: profileRows } = userIds.length
    ? await supabase
        .from("organization_user_profiles")
        .select("user_id, branch_id, all_locations, location_scope_ids")
        .eq("organization_id", tenant.organizationId)
        .in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; branch_id: string | null; all_locations: boolean | null; location_scope_ids: string[] | null }> };

  const { data: membershipRows } = userIds.length
    ? await supabase
        .from("memberships")
        .select("user_id, branch_id, all_locations, location_scope_ids")
        .eq("organization_id", tenant.organizationId)
        .in("user_id", userIds)
    : { data: [] as Array<{ user_id: string; branch_id: string | null; all_locations: boolean | null; location_scope_ids: string[] | null }> };

  const profileByUserId = new Map((profileRows ?? []).map((row) => [row.user_id, row]));
  const membershipByUserId = new Map((membershipRows ?? []).map((row) => [row.user_id, row]));
  const branchNameById = new Map(mappedBranches.map((row) => [row.id, row.name]));

  const mappedUsers = userRows.map((row) => {
    const profile = row.userId ? profileByUserId.get(row.userId) : null;
    const membership = row.userId ? membershipByUserId.get(row.userId) : null;
    const allLocations = membership?.all_locations === true || profile?.all_locations === true;
    const locationScopeNames = ((membership?.location_scope_ids ?? profile?.location_scope_ids ?? []) as string[])
      .map((id) => branchNameById.get(id))
      .filter((value): value is string => Boolean(value));

    const branchName = allLocations
      ? "Todas las locaciones"
      : (locationScopeNames[0]
        ?? (membership?.branch_id ? (branchNameById.get(membership.branch_id) ?? null) : null)
        ?? (profile?.branch_id ? (branchNameById.get(profile.branch_id) ?? null) : null)
        ?? row.branchName
        ?? "Sin locación");

    return {
      ...row,
      branchName,
      branchId: allLocations ? null : (membership?.branch_id ?? profile?.branch_id ?? row.branchId ?? null),
    };
  });

  return NextResponse.json({
    users: mappedUsers,
    branches: mappedBranches,
  });
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
    .select("status, role_id, branch_id, all_locations, location_scope_ids")
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

  const allLocations = !branchId;
  const locationScopeIds = branchId ? [branchId] : [];

  const { error: updateError } = await supabase
    .from("memberships")
    .update({ role_id: role.id, status, branch_id: branchId, all_locations: allLocations, location_scope_ids: locationScopeIds })
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
      actorId: userId,
      metadata: {
        role_code: roleCode,
        status,
        branch_id: branchId,
        all_locations: allLocations,
        location_scope_ids: locationScopeIds,
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
    actorId: userId,
    metadata: {
      role_code: roleCode,
      status,
      branch_id: branchId,
      all_locations: allLocations,
      location_scope_ids: locationScopeIds,
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
      actorId: userId,
      metadata: {
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
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }

  const fullName = String(formData.get("full_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleCodeInput = String(formData.get("role_code") ?? "employee").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  const allLocations = !branchId;
  const locationScopeIds = branchId ? [branchId] : [];
  const accessStatusRaw = String(formData.get("access_status") ?? "active").trim().toLowerCase();
  const accessStatus = accessStatusRaw === "inactive" || accessStatusRaw === "inactivo" ? "inactive" : "active";

  if (!fullName || !email) {
    return NextResponse.json({ error: "Nombre completo y correo corporativo son obligatorios" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });
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
    organizationId: tenant.organizationId,
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
        { error: getPlanLimitErrorMessage(error, "No puedes crear más usuarios con tu plan actual") },
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
        all_locations: allLocations,
        location_scope_ids: locationScopeIds,
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
    actorId: userId,
    metadata: {
      target_user_id: targetUserId,
      full_name: fullName,
      email,
      role_code: roleCode,
      status: accessStatus,
      branch_id: branchId,
      all_locations: allLocations,
      location_scope_ids: locationScopeIds,
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
    actorId: userId,
    metadata: {
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
      actorId: userId,
      metadata: {
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
    actorId: userId,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
