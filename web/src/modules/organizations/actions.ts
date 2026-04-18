"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireSuperadmin } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { createSuperadminImpersonationSession, setSuperadminImpersonationCookie } from "@/shared/lib/impersonation";
import { setActiveOrganizationIdCookie } from "@/shared/lib/tenant-selection";

import {
  sendOrganizationAdminInvitation,
} from "./services/invitation.service";
import {
  slugify,
  toNullableInt,
  provisionOrganizationFromPlan,
  syncOrganizationPlan,
  cleanupTenantStorageArtifacts,
} from "./services/organization.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qs(message: string) {
  return encodeURIComponent(message);
}

// ---------------------------------------------------------------------------
// Create Organization
// ---------------------------------------------------------------------------

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
        qs("La contraseña del admin inicial debe tener al menos 8 caracteres"),
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
        qs(`No se pudo crear la organización: ${orgError?.message ?? "error"}`),
    );
  }

  // Provision modules + limits from plan
  await provisionOrganizationFromPlan({ organizationId: org.id, planId });

  // Send admin invitation
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

// ---------------------------------------------------------------------------
// Toggle Module
// ---------------------------------------------------------------------------

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
        qs("No se encontró el módulo seleccionado"),
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
        qs(`El módulo core '${moduleRow.name}' no se puede desactivar`),
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

// ---------------------------------------------------------------------------
// Update Organization
// ---------------------------------------------------------------------------

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

  // Sync plan if changed
  if (planChanged) {
    const syncResult = await syncOrganizationPlan({ organizationId, planId });
    if (!syncResult.ok) {
      redirect(
        "/superadmin/organizations?status=error&message=" + qs(syncResult.message),
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

// ---------------------------------------------------------------------------
// Delete Organization
// ---------------------------------------------------------------------------

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
        qs("No se encontró la organización a eliminar"),
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
        qs(`No se pudo eliminar organización: ${deleteError.message}`),
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

// ---------------------------------------------------------------------------
// Impersonation
// ---------------------------------------------------------------------------

export async function startOrganizationImpersonationAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "").trim();
  const organizationName = String(formData.get("organization_name") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim() || "superadmin_support";

  if (!organizationId) {
    redirect(
      "/superadmin/organizations?status=error&message=" +
        qs("No se pudo iniciar impersonación: organización inválida"),
    );
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    redirect(
      "/auth/login?error=" +
        qs("Tu sesión expiró. Vuelve a iniciar sesión para impersonar una organización"),
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
        qs("No se encontró la organización seleccionada"),
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
        qs(`No se pudo iniciar impersonación: ${session.error}`),
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

// ---------------------------------------------------------------------------
// Upsert Organization Limits
// ---------------------------------------------------------------------------

export async function upsertOrganizationLimitsAction(formData: FormData) {
  await requireSuperadmin();

  const organizationId = String(formData.get("organization_id") ?? "");

  if (!organizationId) {
    return;
  }

  const maxBranches = toNullableInt(String(formData.get("max_branches") ?? ""));
  const maxUsers = toNullableInt(String(formData.get("max_users") ?? ""));
  const maxStorageMb = toNullableInt(String(formData.get("max_storage_mb") ?? ""));
  const maxEmployees = toNullableInt(String(formData.get("max_employees") ?? ""));

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

// ---------------------------------------------------------------------------
// Assign Company Admin
// ---------------------------------------------------------------------------

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
          qs("Completa organización, email, nombre y contraseña"),
      );
    }

    if (password.length < 8) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs("La contraseña debe tener al menos 8 caracteres"),
      );
    }

    const supabaseUser = await createSupabaseServerClient();
    const { data: authData } = await supabaseUser.auth.getUser();

    const invitation = await sendOrganizationAdminInvitation({
      organizationId,
      email,
      fullName,
      password,
      activateMembership: true,
      sentBy: authData.user?.id ?? null,
    });

    if (!invitation.ok) {
      redirect(
        "/superadmin/organizations?status=error&message=" +
          qs(`No se pudo asignar admin: ${invitation.message}`),
      );
    }

    await logAuditEvent({
      action: "organization.admin.assign",
      entityType: "membership",
      entityId: null,
      organizationId,
      eventDomain: "superadmin",
      outcome: "success",
      severity: "high",
      metadata: {
        email,
        role: "company_admin",
        delivery_mode: invitation.mode,
      },
    });

    revalidatePath("/superadmin/organizations");
    const successMessage =
      invitation.mode === "recovery"
        ? `Admin asignado. Usuario existente actualizado y correo de acceso enviado a ${email}`
        : `Admin asignado e invitacion enviada a ${email}`;
    redirect(
      "/superadmin/organizations?status=success&message=" +
        qs(successMessage),
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

// ---------------------------------------------------------------------------
// Reorder Branches
// ---------------------------------------------------------------------------

export async function reorderBranchesAction(branchIds: string[]) {
  const { assertCompanyAdminModuleApi } = await import("@/shared/lib/access");

  // Basic validation: settings module is enough to manage branches
  const access = await assertCompanyAdminModuleApi("settings");

  if (!access.ok) {
    return { ok: false, error: access.error };
  }

  const organizationId = access.tenant.organizationId;
  const admin = createSupabaseAdminClient();

  // First, verify all IDs belong to this organization to prevent cross-tenant updates
  const { data: validBranches } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", branchIds);

  const validIds = (validBranches ?? []).map((b) => b.id);
  const filteredIds = branchIds.filter((id) => validIds.includes(id));

  if (filteredIds.length === 0) {
    return { ok: false, error: "No se encontraron locaciones validas para reordenar" };
  }

  // Perform sequential updates for sort_order
  // In a real high-scale app, we might use a single RPC, 
  // but for a dozen branches, individual updates are fine and cleaner.
  const updates = filteredIds.map((id, index) =>
    admin
      .from("branches")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("organization_id", organizationId) // Redundant but safe
  );

  const results = await Promise.all(updates);
  const hasError = results.some((r) => r.error);

  if (hasError) {
    console.error("Error reordering branches", results.find((r) => r.error)?.error);
    return { ok: false, error: "Error al guardar el nuevo orden" };
  }

  await logAuditEvent({
    action: "organization.branches.reorder",
    entityType: "organization",
    entityId: organizationId,
    organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "low",
    metadata: { branchCount: filteredIds.length },
  });

  revalidatePath("/app"); // Revalidate sidebar
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reorder Departments
// ---------------------------------------------------------------------------

export async function reorderDepartmentsAction(departmentIds: string[] = []) {
  if (!departmentIds || departmentIds.length === 0) return { ok: true };
  const { assertCompanyAdminModuleApi } = await import("@/shared/lib/access");

  const access = await assertCompanyAdminModuleApi("settings");

  if (!access.ok) {
    return { ok: false, error: access.error };
  }

  const organizationId = access.tenant.organizationId;
  const admin = createSupabaseAdminClient();

  // Verify ownership
  const { data: validItems } = await admin
    .from("organization_departments")
    .select("id")
    .eq("organization_id", organizationId)
    .in("id", departmentIds);

  const validIds = (validItems ?? []).map((i) => i.id);
  const filteredIds = departmentIds.filter((id) => validIds.includes(id));

  if (filteredIds.length === 0) {
    return { ok: false, error: "No se encontraron departamentos validos" };
  }

  const updates = filteredIds.map((id, index) =>
    admin
      .from("organization_departments")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("organization_id", organizationId)
  );

  await Promise.all(updates);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reorder Department Positions
// ---------------------------------------------------------------------------

export async function reorderDepartmentPositionsAction(params: {
  departmentId: string;
  positionIds: string[];
}) {
  const { departmentId, positionIds = [] } = params;
  if (!positionIds || positionIds.length === 0) return { ok: true };
  const { assertCompanyAdminModuleApi } = await import("@/shared/lib/access");

  const access = await assertCompanyAdminModuleApi("settings");

  if (!access.ok) {
    return { ok: false, error: access.error };
  }

  const organizationId = access.tenant.organizationId;
  const admin = createSupabaseAdminClient();

  // Verify ownership and department relation
  const { data: validItems } = await admin
    .from("department_positions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId)
    .in("id", positionIds);

  const validIds = (validItems ?? []).map((i) => i.id);
  const filteredIds = positionIds.filter((id) => validIds.includes(id));

  if (filteredIds.length === 0) {
    return { ok: false, error: "No se encontraron puestos validos" };
  }

  const updates = filteredIds.map((id, index) =>
    admin
      .from("department_positions")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("department_id", departmentId)
  );

  await Promise.all(updates);
  return { ok: true };
}
