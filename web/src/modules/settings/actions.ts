"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantContext, requireTenantModule } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { assertPlanLimitForBranches, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";

function qs(message: string) {
  return encodeURIComponent(message);
}

function toCode(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function upsertOrganizationSettingsAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const supportEmail = String(formData.get("support_email") ?? "").trim() || null;
  const supportPhone = String(formData.get("support_phone") ?? "").trim() || null;
  const timezone = String(formData.get("timezone") ?? "").trim() || null;
  const primaryColor = String(formData.get("primary_color") ?? "").trim() || null;
  const accentColor = String(formData.get("accent_color") ?? "").trim() || null;
  const dashboardNote = String(formData.get("dashboard_note") ?? "").trim() || null;
  const feedbackWhatsapp = String(formData.get("feedback_whatsapp") ?? "").trim() || null;

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: tenant.organizationId,
      support_email: supportEmail,
      support_phone: supportPhone,
      timezone,
      primary_color: primaryColor,
      accent_color: accentColor,
      dashboard_note: dashboardNote,
      feedback_whatsapp: feedbackWhatsapp,
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
    metadata: {
      supportEmail,
      supportPhone,
      timezone,
      primaryColor,
      accentColor,
    },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/dashboard");
  redirect("/app/settings?status=success&message=" + qs("Configuracion guardada"));
}

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

export async function createBranchAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  const state = String(formData.get("state") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  if (!name) {
    redirect("/app/settings?status=error&message=" + qs("Nombre de locacion obligatorio") + "#org-structure");
  }

  const code = toCode(name);

  try {
    await assertPlanLimitForBranches(tenant.organizationId, 1);
  } catch (error) {
    redirect(
      "/app/settings?status=error&message=" +
        qs(getPlanLimitErrorMessage(error, "Limite de sucursales alcanzado. Actualiza tu plan para continuar.")) +
        "#org-structure",
    );
  }

  const { data: existing } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("code", code)
    .maybeSingle();

  if (existing) {
    redirect("/app/settings?status=error&message=" + qs("Ya existe una locacion con ese nombre") + "#org-structure");
  }

  const { data: created, error } = await supabase
    .from("branches")
    .insert({
      organization_id: tenant.organizationId,
      code,
      name,
      city,
      state,
      country,
      address,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo crear locacion: ${error.message}`) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.branch.create",
    entityType: "branch",
    entityId: created?.id,
    organizationId: tenant.organizationId,
    metadata: { name, city, state, country },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  revalidatePath("/app/documents");
  redirect("/app/settings?status=success&message=" + qs("Locacion creada") + "#org-structure");
}

export async function toggleBranchStatusAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const branchId = String(formData.get("branch_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() === "active";

  if (!branchId) {
    redirect("/app/settings?status=error&message=" + qs("Locacion invalida") + "#org-structure");
  }

  const { error } = await supabase
    .from("branches")
    .update({ is_active: nextStatus })
    .eq("organization_id", tenant.organizationId)
    .eq("id", branchId);

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo actualizar locacion: ${error.message}`) + "#org-structure");
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

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  revalidatePath("/app/documents");
  redirect("/app/settings?status=success&message=" + qs("Locacion actualizada") + "#org-structure");
}

export async function updateBranchAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const branchId = String(formData.get("branch_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim() || null;
  const state = String(formData.get("state") ?? "").trim() || null;
  const country = String(formData.get("country") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;

  if (!branchId || !name) {
    redirect("/app/settings?status=error&message=" + qs("Locacion invalida") + "#org-structure");
  }

  const code = toCode(name);

  const { data: duplicate } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("code", code)
    .neq("id", branchId)
    .maybeSingle();

  if (duplicate) {
    redirect("/app/settings?status=error&message=" + qs("Ya existe otra locacion con ese nombre") + "#org-structure");
  }

  const { error } = await supabase
    .from("branches")
    .update({
      name,
      code,
      city,
      state,
      country,
      address,
    })
    .eq("organization_id", tenant.organizationId)
    .eq("id", branchId);

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo actualizar locacion: ${error.message}`) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.branch.update",
    entityType: "branch",
    entityId: branchId,
    organizationId: tenant.organizationId,
    metadata: { name, city, state, country },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  revalidatePath("/app/documents");
  redirect("/app/settings?status=success&message=" + qs("Locacion editada") + "#org-structure");
}

export async function createDepartmentAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect("/app/settings?status=error&message=" + qs("Nombre de departamento obligatorio") + "#org-structure");
  }

  const code = toCode(name);

  const { data: created, error } = await supabase
    .from("organization_departments")
    .insert({
      organization_id: tenant.organizationId,
      code: code || null,
      name,
      description,
      created_by: authData.user?.id ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo crear departamento: ${error.message}`) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department.create",
    entityType: "organization_department",
    entityId: created?.id,
    organizationId: tenant.organizationId,
    metadata: { name },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  revalidatePath("/app/documents");
  redirect("/app/settings?status=success&message=" + qs("Departamento creado") + "#org-structure");
}

export async function toggleDepartmentStatusAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const departmentId = String(formData.get("department_id") ?? "").trim();
  const nextStatus = String(formData.get("next_status") ?? "").trim() === "active";

  if (!departmentId) {
    redirect("/app/settings?status=error&message=" + qs("Departamento invalido") + "#org-structure");
  }

  const { error } = await supabase
    .from("organization_departments")
    .update({ is_active: nextStatus })
    .eq("organization_id", tenant.organizationId)
    .eq("id", departmentId);

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo actualizar departamento: ${error.message}`) + "#org-structure");
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

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  revalidatePath("/app/documents");
  redirect("/app/settings?status=success&message=" + qs("Departamento actualizado") + "#org-structure");
}

export async function updateDepartmentAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();

  const departmentId = String(formData.get("department_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!departmentId || !name) {
    redirect("/app/settings?status=error&message=" + qs("Departamento invalido") + "#org-structure");
  }

  const code = toCode(name);

  const { data: duplicate } = await supabase
    .from("organization_departments")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("name", name)
    .neq("id", departmentId)
    .maybeSingle();

  if (duplicate) {
    redirect("/app/settings?status=error&message=" + qs("Ya existe otro departamento con ese nombre") + "#org-structure");
  }

  const { error } = await supabase
    .from("organization_departments")
    .update({ name, code: code || null, description })
    .eq("organization_id", tenant.organizationId)
    .eq("id", departmentId);

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo actualizar departamento: ${error.message}`) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department.update",
    entityType: "organization_department",
    entityId: departmentId,
    organizationId: tenant.organizationId,
    metadata: { name },
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/employees");
  revalidatePath("/app/checklists");
  revalidatePath("/app/documents");
  redirect("/app/settings?status=success&message=" + qs("Departamento editado") + "#org-structure");
}

export async function createDepartmentPositionAction(formData: FormData) {
  const tenant = await requireTenantModule("settings");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const departmentId = String(formData.get("department_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!departmentId || !name) {
    redirect("/app/settings?status=error&message=" + qs("Departamento y puesto son obligatorios") + "#org-structure");
  }

  const { data: department } = await supabase
    .from("organization_departments")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", departmentId)
    .maybeSingle();

  if (!department) {
    redirect("/app/settings?status=error&message=" + qs("Departamento invalido") + "#org-structure");
  }

  const code = toCode(name);

  const { data: duplicate } = await supabase
    .from("department_positions")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("department_id", departmentId)
    .eq("code", code)
    .maybeSingle();

  if (duplicate) {
    redirect("/app/settings?status=error&message=" + qs("Ya existe ese puesto en el departamento") + "#org-structure");
  }

  const { data: created, error } = await supabase
    .from("department_positions")
    .insert({
      organization_id: tenant.organizationId,
      department_id: departmentId,
      code: code || null,
      name,
      description,
      created_by: authData.user?.id ?? null,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo crear puesto: ${error.message}`) + "#org-structure");
  }

  await logAuditEvent({
    action: "settings.department_position.create",
    entityType: "department_position",
    entityId: created?.id,
    organizationId: tenant.organizationId,
    metadata: { departmentId, name },
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

  if (!positionId) {
    redirect("/app/settings?status=error&message=" + qs("Puesto invalido") + "#org-structure");
  }

  const { error } = await supabase
    .from("department_positions")
    .update({ is_active: nextStatus })
    .eq("organization_id", tenant.organizationId)
    .eq("id", positionId);

  if (error) {
    redirect("/app/settings?status=error&message=" + qs(`No se pudo actualizar puesto: ${error.message}`) + "#org-structure");
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
