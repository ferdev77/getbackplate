"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { createSuperadminImpersonationSession, setSuperadminImpersonationCookie } from "@/shared/lib/impersonation";
import {
  assertOrganizationCanSwitchToPlan,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";
import { setActiveOrganizationIdCookie } from "@/shared/lib/tenant-selection";

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function qs(message: string) {
  return encodeURIComponent(message);
}

function randomPassword() {
  return `Gb!${Math.random().toString(36).slice(2)}${Date.now().toString(36)}A9`;
}

function invitationCode() {
  return crypto.randomUUID();
}

function buildTemporaryPasswordMetadata(
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

async function getCompanyAdminRoleId() {
  const supabase = createSupabaseAdminClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "company_admin")
    .single();
  return role?.id ?? null;
}

async function createInvitationRecord(params: {
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

async function sendOrganizationAdminInvitation(params: {
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

export async function createOrganizationAction(formData: FormData) {
  await requireSuperadmin();

  const name = String(formData.get("name") ?? "").trim();
  const providedSlug = String(formData.get("slug") ?? "").trim();
  const planId = String(formData.get("plan_id") ?? "").trim() || null;
  const adminEmail = String(formData.get("admin_email") ?? "").trim().toLowerCase();
  const adminFullName = String(formData.get("admin_full_name") ?? "").trim();
  const adminPassword = String(formData.get("admin_password") ?? "");

  if (!name || !adminEmail || !adminFullName || !adminPassword) {
    redirect(
      "/superadmin/organizations?action=create&status=error&message=" +
        qs("Completa nombre de empresa y datos del admin inicial"),
    );
  }

  if (adminPassword.length < 8) {
    redirect(
      "/superadmin/organizations?action=create&status=error&message=" +
        qs("La contrasena del admin inicial debe tener al menos 8 caracteres"),
    );
  }

  const supabase = createSupabaseAdminClient();
  const supabaseUser = await createSupabaseServerClient();
  const { data: authData } = await supabaseUser.auth.getUser();

  const slugBase = providedSlug ? slugify(providedSlug) : slugify(name);
  const slug = slugBase || `org-${Math.random().toString(36).slice(2, 8)}`;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name,
      slug,
      plan_id: planId,
      created_by: authData.user?.id ?? null,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    redirect(
      "/superadmin/organizations?action=create&status=error&message=" +
        qs(`No se pudo crear la organizacion: ${orgError?.message ?? "error"}`),
    );
  }

  const { data: modules } = await supabase
    .from("module_catalog")
    .select("id, is_core");

  let planModuleIds = new Set<string>();
  if (planId) {
    const { data: planModules } = await supabase
      .from("plan_modules")
      .select("module_id")
      .eq("plan_id", planId)
      .eq("is_enabled", true);
    planModuleIds = new Set((planModules ?? []).map((row) => row.module_id));
  }

  if (modules?.length) {
    await supabase.from("organization_modules").insert(
      modules.map((mod) => ({
        organization_id: org.id,
        module_id: mod.id,
        is_enabled: Boolean(mod.is_core) || planModuleIds.has(mod.id),
        enabled_at: Boolean(mod.is_core) || planModuleIds.has(mod.id) ? new Date().toISOString() : null,
      })),
    );
  }

  if (planId) {
    const { data: planLimits } = await supabase
      .from("plans")
      .select("max_branches, max_users, max_storage_mb, max_employees")
      .eq("id", planId)
      .maybeSingle();

    await supabase.from("organization_limits").upsert(
      {
        organization_id: org.id,
        max_branches: planLimits?.max_branches ?? null,
        max_users: planLimits?.max_users ?? null,
        max_storage_mb: planLimits?.max_storage_mb ?? null,
        max_employees: planLimits?.max_employees ?? null,
      },
      { onConflict: "organization_id" },
    );
  }

  const invitation = await sendOrganizationAdminInvitation({
    organizationId: org.id,
    email: adminEmail,
    fullName: adminFullName,
    password: adminPassword,
    activateMembership: true,
    sentBy: authData.user?.id ?? null,
  });

  if (!invitation.ok) {
    redirect(
      "/superadmin/organizations?action=create&status=error&message=" +
        qs(`Organizacion creada, pero fallo envio de invitacion: ${invitation.message}`),
    );
  }

  await logAuditEvent({
    action: "organization.create",
    entityType: "organization",
    entityId: org.id,
    organizationId: org.id,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: { name, slug, planId, adminEmail },
  });

  revalidatePath("/superadmin/organizations");
  const successMessage =
    invitation.mode === "recovery"
      ? `Empresa creada. Usuario configurado y correo de acceso enviado a ${adminEmail}`
      : `Empresa creada. Invitacion enviada a ${adminEmail}`;
  redirect(
    "/superadmin/organizations?status=success&message=" +
      qs(successMessage),
  );
}

export async function toggleOrganizationModuleAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "");
  const moduleId = String(formData.get("module_id") ?? "");
  const nextEnabled = String(formData.get("next_enabled") ?? "") === "true";

  if (!organizationId || !moduleId) {
    return;
  }

  const supabase = createSupabaseAdminClient();

  const { data: moduleRow } = await supabase
    .from("module_catalog")
    .select("id, code, name, is_core")
    .eq("id", moduleId)
    .maybeSingle();

  if (!moduleRow) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs("No se encontro el modulo seleccionado"),
    );
  }

  if (moduleRow.is_core && !nextEnabled) {
    await logAuditEvent({
      action: "organization.module.toggle.denied",
      entityType: "organization_module",
      entityId: moduleId,
      organizationId,
      eventDomain: "superadmin",
      outcome: "denied",
      severity: "high",
      metadata: {
        moduleId,
        moduleCode: moduleRow.code,
        moduleName: moduleRow.name,
        nextEnabled,
        reason: "core_module_cannot_be_disabled",
      },
    });

    redirect(
      `/superadmin/organizations?action=edit&org=${organizationId}&status=error&message=` +
        qs(`El modulo core '${moduleRow.name}' no se puede desactivar`),
    );
  }

  await supabase.from("organization_modules").upsert(
    {
      organization_id: organizationId,
      module_id: moduleId,
      is_enabled: nextEnabled,
      enabled_at: nextEnabled ? new Date().toISOString() : null,
    },
    {
      onConflict: "organization_id,module_id",
    },
  );

  await logAuditEvent({
    action: "organization.module.toggle",
    entityType: "organization_module",
    entityId: moduleId,
    organizationId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: {
      moduleId,
      moduleCode: moduleRow.code,
      moduleName: moduleRow.name,
      nextEnabled,
      isCore: moduleRow.is_core,
    },
  });

  revalidatePath("/superadmin/organizations");
}

export async function updateOrganizationAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim();
  const planId = String(formData.get("plan_id") ?? "").trim() || null;

  if (!organizationId || !name || !status) {
    return;
  }

  const slug = slugify(name) || `org-${Math.random().toString(36).slice(2, 8)}`;

  const supabase = createSupabaseAdminClient();
  const { data: currentOrg } = await supabase
    .from("organizations")
    .select("plan_id")
    .eq("id", organizationId)
    .maybeSingle();

  const planChanged = (currentOrg?.plan_id ?? null) !== planId;

  if (planChanged && planId) {
    try {
      await assertOrganizationCanSwitchToPlan(organizationId, planId);
    } catch (error) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs(
            getPlanLimitErrorMessage(
              error,
              "No se puede cambiar plan porque el uso actual supera los limites del plan destino.",
            ),
          ),
      );
    }
  }

  const organizationUpdatePayload: {
    name: string;
    slug: string;
    status: string;
    plan_id?: string | null;
  } = {
    name,
    slug,
    status,
  };

  if (planChanged) {
    organizationUpdatePayload.plan_id = planId;
  }

  await supabase
    .from("organizations")
    .update(organizationUpdatePayload)
    .eq("id", organizationId);

  if (planChanged && planId) {
    const { data: planLimits } = await supabase
      .from("plans")
      .select("max_branches, max_users, max_storage_mb, max_employees")
      .eq("id", planId)
      .maybeSingle();

    await supabase.from("organization_limits").upsert(
      {
        organization_id: organizationId,
        max_branches: planLimits?.max_branches ?? null,
        max_users: planLimits?.max_users ?? null,
        max_storage_mb: planLimits?.max_storage_mb ?? null,
        max_employees: planLimits?.max_employees ?? null,
      },
      { onConflict: "organization_id" },
    );
  }

  if (planChanged) {
    const { data: modules } = await supabase
      .from("module_catalog")
      .select("id, is_core");

    let planModuleIds = new Set<string>();
    if (planId) {
      const { data: planModules } = await supabase
        .from("plan_modules")
        .select("module_id")
        .eq("plan_id", planId)
        .eq("is_enabled", true);

      planModuleIds = new Set((planModules ?? []).map((row) => row.module_id));
    }

    if (modules?.length) {
      await supabase.from("organization_modules").upsert(
        modules.map((mod) => {
          const shouldEnable = Boolean(mod.is_core) || planModuleIds.has(mod.id);
          return {
            organization_id: organizationId,
            module_id: mod.id,
            is_enabled: shouldEnable,
            enabled_at: shouldEnable ? new Date().toISOString() : null,
          };
        }),
        { onConflict: "organization_id,module_id" },
      );
    }
  }

  await logAuditEvent({
    action: "organization.update",
    entityType: "organization",
    entityId: organizationId,
    organizationId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: { name, slug, status, planId, planChanged, modulesSynced: planChanged },
  });

  revalidatePath("/superadmin/organizations");
}

async function cleanupTenantStorageArtifacts(organizationId: string) {
  const supabase = createSupabaseAdminClient();
  const bucketId = "tenant-documents";

  const { data: objects } = await supabase
    .schema("storage")
    .from("objects")
    .select("name")
    .eq("bucket_id", bucketId)
    .like("name", `${organizationId}/%`)
    .limit(10000);

  const paths = (objects ?? []).map((row) => row.name).filter(Boolean);
  if (!paths.length) {
    return;
  }

  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    await supabase.storage.from(bucketId).remove(chunk);
  }
}

export async function deleteOrganizationAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const confirmSlug = String(formData.get("confirm_slug") ?? "").trim();

  if (!organizationId || !confirmSlug) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs("Confirma la empresa a eliminar y escribe su slug"),
    );
  }

  const supabase = createSupabaseAdminClient();
  const { data: organization } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs("No se encontro la organizacion a eliminar"),
    );
  }

  if (organization.slug !== confirmSlug) {
    redirect(
      `/superadmin/organizations?action=delete&org=${organizationId}&status=error&message=` +
        qs("El slug de confirmacion no coincide"),
    );
  }

  await cleanupTenantStorageArtifacts(organizationId);

  const { error: deleteError } = await supabase
    .from("organizations")
    .delete()
    .eq("id", organizationId);

  if (deleteError) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs(`No se pudo eliminar organizacion: ${deleteError.message}`),
    );
  }

  await logAuditEvent({
    action: "organization.delete",
    entityType: "organization",
    entityId: organizationId,
    organizationId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "critical",
    metadata: {
      name: organization.name,
      slug: organization.slug,
      cascadeDelete: true,
      storageCleanupAttempted: true,
    },
  });

  revalidatePath("/superadmin/organizations");
  redirect(
    "/superadmin/organizations?status=success&message=" +
      qs(`Empresa '${organization.name}' eliminada junto con sus datos`),
  );
}

export async function startOrganizationImpersonationAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const organizationName = String(formData.get("organization_name") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "superadmin_support";

  if (!organizationId) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs("No se pudo iniciar impersonacion: organizacion invalida"),
    );
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    redirect(
      "/auth/login?error=" +
        qs("Tu sesion expiro. Vuelve a iniciar sesion para impersonar una organizacion"),
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("id, name")
    .eq("id", organizationId)
    .maybeSingle();

  if (!organization) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs("No se encontro la organizacion seleccionada"),
    );
  }

  const session = await createSuperadminImpersonationSession({
    superadminUserId: user.id,
    organizationId,
    reason,
  });

  if (!session.ok) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs(`No se pudo iniciar impersonacion: ${session.error}`),
    );
  }

  await setSuperadminImpersonationCookie(session.sessionId);
  await setActiveOrganizationIdCookie(organizationId);

  await logAuditEvent({
    action: "organization.impersonation.start",
    entityType: "superadmin_impersonation_session",
    entityId: session.sessionId,
    organizationId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: {
      organization_name: organizationName || organization.name,
      expires_at: session.expiresAt,
      reason,
    },
  });

  redirect("/app/dashboard");
}

function toNullableInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

export async function upsertOrganizationLimitsAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "");

  if (!organizationId) {
    return;
  }

  const maxBranches = toNullableInt(formData.get("max_branches"));
  const maxUsers = toNullableInt(formData.get("max_users"));
  const maxStorageMb = toNullableInt(formData.get("max_storage_mb"));
  const maxEmployees = toNullableInt(formData.get("max_employees"));

  const supabase = createSupabaseAdminClient();
  await supabase.from("organization_limits").upsert(
    {
      organization_id: organizationId,
      max_branches: maxBranches,
      max_users: maxUsers,
      max_storage_mb: maxStorageMb,
      max_employees: maxEmployees,
    },
    { onConflict: "organization_id" },
  );

  await logAuditEvent({
    action: "organization.limits.upsert",
    entityType: "organization_limits",
    entityId: organizationId,
    organizationId,
    eventDomain: "superadmin",
    outcome: "success",
    severity: "high",
    metadata: { maxBranches, maxUsers, maxStorageMb, maxEmployees },
  });

  revalidatePath("/superadmin/organizations");
}

export async function assignCompanyAdminAction(formData: FormData) {
  try {
    await requireSuperadmin();

    const organizationId = String(formData.get("organization_id") ?? "").trim();
    const email = String(formData.get("admin_email") ?? "").trim().toLowerCase();
    const fullName = String(formData.get("admin_full_name") ?? "").trim();
    const password = String(formData.get("admin_password") ?? "");

    if (!organizationId || !email || !fullName || !password) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs("Completa organizacion, email, nombre y contrasena"),
      );
    }

    if (password.length < 8) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs("La contrasena debe tener al menos 8 caracteres"),
      );
    }

    const supabase = createSupabaseAdminClient();

    const { data: role, error: roleError } = await supabase
      .from("roles")
      .select("id")
      .eq("code", "company_admin")
      .single();

    if (roleError || !role) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs("No existe el rol company_admin en la base"),
      );
    }

    let userId: string | null = null;

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: buildTemporaryPasswordMetadata(undefined, fullName),
    });

    if (!createUserError && createdUser.user) {
      userId = createdUser.user.id;
    }

    if (createUserError) {
      const alreadyExists =
        createUserError.message.toLowerCase().includes("already") ||
        createUserError.message.toLowerCase().includes("exists") ||
        createUserError.message.toLowerCase().includes("registered");

      if (!alreadyExists) {
        redirect(
          "/superadmin/organizations?status=error&message=" +
            qs(`No se pudo crear usuario admin: ${createUserError.message}`),
        );
      }

      const existingUser = await findAuthUserByEmail(email);
      userId = existingUser?.id ?? null;

      if (!userId) {
        redirect(
          "/superadmin/organizations?status=error&message=" +
            qs("El email ya existe pero no se pudo recuperar el usuario"),
        );
      }

      const { error: updateUserError } = await supabase.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: buildTemporaryPasswordMetadata(existingUser?.user_metadata, fullName),
      });

      if (updateUserError) {
        redirect(
          "/superadmin/organizations?status=error&message=" +
            qs(`No se pudo actualizar credenciales del admin: ${updateUserError.message}`),
        );
      }
    }

    const { error: membershipError } = await supabase.from("memberships").upsert(
      {
        organization_id: organizationId,
        user_id: userId,
        role_id: role.id,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );

    if (membershipError) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs(`No se pudo asignar admin a la empresa: ${membershipError.message}`),
      );
    }

    await logAuditEvent({
      action: "organization.admin.assign",
      entityType: "membership",
      entityId: userId,
      organizationId,
      eventDomain: "superadmin",
      outcome: "success",
      severity: "high",
      metadata: { email, role: "company_admin" },
    });

    revalidatePath("/superadmin/organizations");
    redirect(
      "/superadmin/organizations?status=success&message=" +
        qs(`Admin asignado correctamente: ${email}`),
    );
  } catch (error) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs(
          `Error inesperado al crear/asignar admin: ${
            error instanceof Error ? error.message : "desconocido"
          }`,
        ),
    );
  }
}
