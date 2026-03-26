"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantContext, requireTenantModule } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

import {
  createBranch,
  updateBranch,
  toggleBranchStatus,
  createDepartment,
  updateDepartment,
  toggleDepartmentStatus,
  createDepartmentPosition,
  toggleDepartmentPositionStatus,
} from "./services/org-structure.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function qs(message: string) {
  return encodeURIComponent(message);
}

const STRUCTURE_REVALIDATE_PATHS = ["/app/settings", "/app/employees", "/app/checklists", "/app/documents"];

function revalidateStructurePaths() {
  for (const path of STRUCTURE_REVALIDATE_PATHS) {
    revalidatePath(path);
  }
}

// ---------------------------------------------------------------------------
// Organization Settings
// ---------------------------------------------------------------------------

export async function upsertOrganizationSettingsAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const supportEmail = String(formData.get("support_email") ?? "").trim() || null;
  const supportPhone = String(formData.get("support_phone") ?? "").trim() || null;
  const feedbackWhatsapp = String(formData.get("feedback_whatsapp") ?? "").trim() || null;
  const websiteUrl = String(formData.get("website_url") ?? "").trim() || null;

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: tenant.organizationId,
      support_email: supportEmail,
      support_phone: supportPhone,
      feedback_whatsapp: feedbackWhatsapp,
      website_url: websiteUrl,
      updated_by: authData.user?.id ?? null,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo guardar configuracion: ${error.message}`));
  }

  await logAuditEvent({
    action: "settings.update",
    entityType: "organization_settings",
    entityId: tenant.organizationId,
    organizationId: tenant.organizationId,
    metadata: { supportEmail, supportPhone, feedbackWhatsapp, websiteUrl },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
  redirect("/app/settings?status=success&message=" + qs("Configuracion guardada"));
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function createFeedbackAction(formData: FormData) {
  const tenant = await requireTenantContext();
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const userId = authData.user?.id;
  if (!userId) {
    redirect("/auth/login");
  }

  const feedbackType = String(formData.get("feedback_type") ?? "idea").trim();
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const pagePath = String(formData.get("page_path") ?? "").trim() || null;

  if (!title || !message) {
    redirect("/app/settings?status=error&message=" + qs("Completa titulo y detalle del feedback") + "#feedback");
  }

  const normalizedType = ["bug", "idea", "other"].includes(feedbackType)
    ? feedbackType
    : "idea";

  const { data: created, error } = await supabase
    .from("feedback_messages")
    .insert({
      organization_id: tenant.organizationId,
      user_id: userId,
      feedback_type: normalizedType,
      title,
      message,
      page_path: pagePath,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo enviar feedback: ${error.message}`) + "#feedback");
  }

  await logAuditEvent({
    action: "feedback.create",
    entityType: "feedback_message",
    entityId: created?.id,
    organizationId: tenant.organizationId,
    metadata: { feedbackType: normalizedType, title, pagePath },
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
  });

  revalidatePath("/app/settings");
  redirect("/app/settings?status=success&message=" + qs("Feedback enviado correctamente") + "#feedback");
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export async function createBranchAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const result = await createBranch({
    supabase,
    organizationId: tenant.organizationId,
    name: String(formData.get("name") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.branch.create",
    entityType: "branch",
    entityId: result.id,
    organizationId: tenant.organizationId,
    metadata: { name: String(formData.get("name") ?? "") },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidateStructurePaths();
  redirect("/app/settings?status=success&message=" + qs("Locacion creada") + "#org-structure");
}

export async function toggleBranchStatusAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const branchId = String(formData.get("branch_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() === "active";

  const result = await toggleBranchStatus({ supabase, organizationId: tenant.organizationId, branchId, nextStatus });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.branch.status.toggle",
    entityType: "branch",
    entityId: branchId,
    organizationId: tenant.organizationId,
    metadata: { nextStatus },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidateStructurePaths();
  redirect("/app/settings?status=success&message=" + qs("Locacion actualizada") + "#org-structure");
}

export async function updateBranchAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const result = await updateBranch({
    supabase,
    organizationId: tenant.organizationId,
    branchId: String(formData.get("branch_id") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim() || null,
    state: String(formData.get("state") ?? "").trim() || null,
    country: String(formData.get("country") ?? "").trim() || null,
    address: String(formData.get("address") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.branch.update",
    entityType: "branch",
    entityId: result.id,
    organizationId: tenant.organizationId,
    metadata: { name: String(formData.get("name") ?? "") },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidateStructurePaths();
  redirect("/app/settings?status=success&message=" + qs("Locacion editada") + "#org-structure");
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function createDepartmentAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const result = await createDepartment({
    supabase,
    organizationId: tenant.organizationId,
    createdBy: authData.user?.id ?? null,
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department.create",
    entityType: "organization_department",
    entityId: result.id,
    organizationId: tenant.organizationId,
    metadata: { name: String(formData.get("name") ?? "") },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidateStructurePaths();
  redirect("/app/settings?status=success&message=" + qs("Departamento creado") + "#org-structure");
}

export async function toggleDepartmentStatusAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const departmentId = String(formData.get("department_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() === "active";

  const result = await toggleDepartmentStatus({ supabase, organizationId: tenant.organizationId, departmentId, nextStatus });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department.status.toggle",
    entityType: "organization_department",
    entityId: departmentId,
    organizationId: tenant.organizationId,
    metadata: { nextStatus },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidateStructurePaths();
  redirect("/app/settings?status=success&message=" + qs("Departamento actualizado") + "#org-structure");
}

export async function updateDepartmentAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const result = await updateDepartment({
    supabase,
    organizationId: tenant.organizationId,
    departmentId: String(formData.get("department_id") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department.update",
    entityType: "organization_department",
    entityId: result.id,
    organizationId: tenant.organizationId,
    metadata: { name: String(formData.get("name") ?? "") },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidateStructurePaths();
  redirect("/app/settings?status=success&message=" + qs("Departamento editado") + "#org-structure");
}

// ---------------------------------------------------------------------------
// Department Positions
// ---------------------------------------------------------------------------

export async function createDepartmentPositionAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const result = await createDepartmentPosition({
    supabase,
    organizationId: tenant.organizationId,
    createdBy: authData.user?.id ?? null,
    departmentId: String(formData.get("department_id") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
  });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department_position.create",
    entityType: "department_position",
    entityId: result.id,
    organizationId: tenant.organizationId,
    metadata: { departmentId: String(formData.get("department_id") ?? ""), name: String(formData.get("name") ?? "") },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  redirect("/app/settings?status=success&message=" + qs("Puesto creado") + "#org-structure");
}

export async function toggleDepartmentPositionStatusAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const positionId = String(formData.get("position_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() === "active";

  const result = await toggleDepartmentPositionStatus({ supabase, organizationId: tenant.organizationId, positionId, nextStatus });

  if (!result.ok) {
    redirect("/app/settings?status=error&message=" + qs(result.message) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department_position.status.toggle",
    entityType: "department_position",
    entityId: positionId,
    organizationId: tenant.organizationId,
    metadata: { nextStatus },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  redirect("/app/settings?status=success&message=" + qs("Puesto actualizado") + "#org-structure");
}
