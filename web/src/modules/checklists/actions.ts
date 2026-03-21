"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { sendTransactionalEmail } from "@/infrastructure/email/client";
import { requireTenantModule } from "@/shared/lib/access";
import { getAuthEmailByUserId } from "@/shared/lib/auth-users";
import { logAuditEvent } from "@/shared/lib/audit";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";

function qs(message: string) {
  return encodeURIComponent(message);
}

function normalizePriority(value: string) {
  const priority = value.trim().toLowerCase();
  if (["low", "medium", "high"].includes(priority)) {
    return priority;
  }
  return "medium";
}

async function sendChecklistAudienceEmail(input: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  organizationId: string;
  templateName: string;
  event: "created" | "submitted";
  itemsCount: number;
  flaggedCount?: number;
  actorEmail?: string;
  targetScope: {
    locations?: string[];
    department_ids?: string[];
    position_ids?: string[];
    users?: string[];
  } | null;
  templateBranchId?: string | null;
  templateDepartmentId?: string | null;
}) {
  const scope = input.targetScope ?? {};
  const locationIds = Array.isArray(scope.locations) ? scope.locations.filter(Boolean) : [];
  const departmentIds = Array.isArray(scope.department_ids) ? scope.department_ids.filter(Boolean) : [];
  const positionIds = Array.isArray(scope.position_ids) ? scope.position_ids.filter(Boolean) : [];
  const scopedUserIds = Array.isArray(scope.users) ? scope.users.filter(Boolean) : [];

  const { data: employees } = await input.supabase
    .from("employees")
    .select("user_id, branch_id, department_id, position, status")
    .eq("organization_id", input.organizationId)
    .eq("status", "active")
    .not("user_id", "is", null);

  const recipientUserIds = new Set<string>();

  for (const employee of employees ?? []) {
    if (!employee.user_id) continue;
    const byTemplateBranch = Boolean(input.templateBranchId) && employee.branch_id === input.templateBranchId;
    const byTemplateDepartment =
      Boolean(input.templateDepartmentId) && employee.department_id === input.templateDepartmentId;
    const byLocationScope = locationIds.length > 0 && Boolean(employee.branch_id) && locationIds.includes(employee.branch_id);
    const byDepartmentScope =
      departmentIds.length > 0 && Boolean(employee.department_id) && departmentIds.includes(employee.department_id);
    const byPositionScope =
      positionIds.length > 0 && Boolean(employee.position) && positionIds.includes(employee.position);
    const byUserScope = scopedUserIds.length > 0 && scopedUserIds.includes(employee.user_id);

    const hasAnyScope =
      locationIds.length > 0 || departmentIds.length > 0 || positionIds.length > 0 || scopedUserIds.length > 0;

    const isInAudience = hasAnyScope
      ? byLocationScope || byDepartmentScope || byPositionScope || byUserScope
      : byTemplateBranch || byTemplateDepartment || (!input.templateBranchId && !input.templateDepartmentId);

    if (isInAudience) {
      recipientUserIds.add(employee.user_id);
    }
  }

  for (const scopedUserId of scopedUserIds) {
    recipientUserIds.add(scopedUserId);
  }

  const emailByUserId = await getAuthEmailByUserId([...recipientUserIds]);
  const recipients = [...new Set([...emailByUserId.values()].filter(Boolean))];

  if (!recipients.length) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
  const reportsUrl = appUrl ? `${appUrl}/app/reports` : "/app/reports";
  const subject =
    input.event === "created"
      ? `Nuevo checklist creado: ${input.templateName}`
      : `Checklist enviado: ${input.templateName}`;
  const html =
    input.event === "created"
      ? `
    <h2 style="margin:0 0 10px 0;">Nuevo checklist creado</h2>
    <p style="margin:0 0 8px 0;color:#444;">Plantilla: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Creado por: <strong>${input.actorEmail ?? "Usuario interno"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver checklists</a></p>
  `
      : `
    <h2 style="margin:0 0 10px 0;">Checklist enviado</h2>
    <p style="margin:0 0 8px 0;color:#444;">Plantilla: <strong>${input.templateName}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Items: <strong>${input.itemsCount}</strong></p>
    <p style="margin:0 0 8px 0;color:#444;">Incidencias: <strong>${input.flaggedCount ?? 0}</strong></p>
    <p style="margin:0 0 14px 0;color:#444;">Enviado por: <strong>${input.actorEmail ?? "Usuario interno"}</strong></p>
    <p style="margin:14px 0 0 0;"><a href="${reportsUrl}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">Ver en reportes</a></p>
  `;
  const text =
    input.event === "created"
      ? `Nuevo checklist creado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nCreado por: ${input.actorEmail ?? "Usuario interno"}\nVer checklists: ${reportsUrl}`
      : `Checklist enviado\nPlantilla: ${input.templateName}\nItems: ${input.itemsCount}\nIncidencias: ${input.flaggedCount ?? 0}\nEnviado por: ${input.actorEmail ?? "Usuario interno"}\nVer en reportes: ${reportsUrl}`;

  await Promise.allSettled(recipients.map((to) => sendTransactionalEmail({ to, subject, html, text })));
}

import { z } from "zod";

const createChecklistSchema = z.object({
  template_id: z.string().trim().optional().transform(v => v || null),
  name: z.string().trim().min(1, "Nombre de plantilla obligatorio"),
  checklist_type: z.enum(["opening", "closing", "prep", "custom"]).catch("custom"),
  checklist_type_other: z.string().trim().optional(),
  branch_id: z.string().trim().optional().transform(v => v || null),
  shift: z.string().trim().optional().transform(v => v || null),
  department_id: z.string().trim().optional().transform(v => v || null),
  department: z.string().trim().optional().transform(v => v || null),
  repeat_every: z.string().trim().default("daily").transform(v => v || "daily"),
  template_status: z.enum(["active", "draft"]).catch("active"),
  notify_via: z.array(z.enum(["whatsapp", "sms"])).default([]),
  location_scope: z.array(z.string()).default([]),
  department_scope: z.array(z.string()).default([]),
  position_scope: z.array(z.string()).default([]),
  user_scope: z.array(z.string()).default([]),
  sections_payload: z.string().trim().optional(),
  items: z.string().trim().optional(),
});

export async function createChecklistTemplateAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();

  const notifyViaRaw = formData.getAll("notify_via").map(String);
  const validNotifyVia = notifyViaRaw.filter(v => v === "whatsapp" || v === "sms");
  const notifyChannels = [...new Set(formData.getAll("notify_channel").map(String))];
  const notifyByEmail = notifyChannels.includes("email");

  const parsed = createChecklistSchema.safeParse({
    template_id: String(formData.get("template_id") ?? ""),
    name: String(formData.get("name") ?? ""),
    checklist_type: String(formData.get("checklist_type") ?? ""),
    checklist_type_other: String(formData.get("checklist_type_other") ?? ""),
    branch_id: String(formData.get("branch_id") ?? ""),
    shift: String(formData.get("shift") ?? ""),
    department_id: String(formData.get("department_id") ?? ""),
    department: String(formData.get("department") ?? ""),
    repeat_every: String(formData.get("repeat_every") ?? ""),
    template_status: String(formData.get("template_status") ?? ""),
    notify_via: validNotifyVia,
    location_scope: formData.getAll("location_scope").map(String),
    department_scope: formData.getAll("department_scope").map(String),
    position_scope: formData.getAll("position_scope").map(String),
    user_scope: formData.getAll("user_scope").map(String),
    sections_payload: String(formData.get("sections_payload") ?? ""),
    items: String(formData.get("items") ?? ""),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Datos invalidos" };
  }

  const {
    template_id: templateId,
    name,
    checklist_type: checklistType,
    checklist_type_other: checklistTypeOther,
    branch_id: branchId,
    shift,
    department_id: departmentId,
    repeat_every: repeatEvery,
    template_status: templateStatus,
    notify_via: notifyVia,
    sections_payload: sectionsPayloadRaw,
    items: itemsInput,
  } = parsed.data;
  let department = parsed.data.department;

  const locationScopes = normalizeScopeSelection(parsed.data.location_scope);
  const departmentScopes = normalizeScopeSelection(parsed.data.department_scope);
  const positionScopes = normalizeScopeSelection(parsed.data.position_scope);
  const userScopes = normalizeScopeSelection(parsed.data.user_scope);

  let normalizedSections: Array<{ name: string; items: string[] }> = [];

  if (sectionsPayloadRaw) {
    try {
      const parsed = JSON.parse(sectionsPayloadRaw);
      if (Array.isArray(parsed)) {
        normalizedSections = parsed
          .map((section: { name?: unknown; items?: unknown }) => ({
            name: typeof section?.name === "string" && section.name.trim() ? section.name.trim() : "General",
            items: Array.isArray(section?.items)
              ? section.items.map((item: unknown) => String(item).trim()).filter(Boolean)
              : [],
          }))
          .filter((section) => section.items.length > 0)
          .slice(0, 20);
      }
    } catch {
      return { success: false, message: "Formato de secciones (JSON) invalido" };
    }
  } else if (itemsInput) {
    const fallbackItems = itemsInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 80);

    if (fallbackItems.length > 0) {
      normalizedSections = [{ name: "General", items: fallbackItems }];
    }
  }

  const totalItems = normalizedSections.reduce((acc, section) => acc + section.items.length, 0);

  if (!name) {
    return { success: false, message: "Nombre de plantilla obligatorio" };
  }

  if (!totalItems) {
    return { success: false, message: "Agrega al menos un item de checklist" };
  }

  if (branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .maybeSingle();

    if (branchError || !branch) {
      return { success: false, message: "Locacion base invalida para esta empresa" };
    }
  }

  if (departmentId) {
    const { data: departmentRow, error: departmentError } = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (departmentError || !departmentRow) {
      return { success: false, message: "Departamento base invalido para esta empresa" };
    }

    department = departmentRow.name;
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId: tenant.organizationId,
    locationIds: locationScopes,
    departmentIds: departmentScopes,
    positionIds: positionScopes,
    userIds: userScopes,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    const messageByField = {
      locations: "Algunas locaciones de alcance no son validas",
      departments: "Algunos departamentos de alcance no son validos",
      positions: "Algunos puestos de alcance no son validos",
      users: "Algunos usuarios seleccionados no son validos",
    } as const;
    redirect(
      "/app/checklists?status=error&message=" +
        qs(messageByField[scopeValidation.field]),
    );
  }

  const templatePayload = {
    branch_id: branchId,
    name,
    checklist_type: checklistType,
    shift,
    department,
    department_id: departmentId,
    repeat_every: repeatEvery,
    target_scope: {
      locations: locationScopes,
      department_ids: departmentScopes,
      position_ids: positionScopes,
      users: userScopes,
      notify_via: notifyVia,
      checklist_type_other: checklistTypeOther || null,
    },
    is_active: templateStatus === "active",
  };

  let template: { id: string } | null = null;
  let templateError: { message?: string } | null = null;
  let preservedHistory = false;

  if (templateId) {
    const { data: existingTemplate } = await supabase
      .from("checklist_templates")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", templateId)
      .maybeSingle();

    if (!existingTemplate) {
      return { success: false, message: "No se encontro la plantilla a editar" };
    }

    const { data: hasSubmissions } = await supabase
      .from("checklist_submissions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("template_id", templateId)
      .limit(1)
      .maybeSingle();

    if (hasSubmissions) {
      preservedHistory = true;
      await supabase
        .from("checklist_templates")
        .update({ is_active: false })
        .eq("organization_id", tenant.organizationId)
        .eq("id", templateId);

      const insertResult = await supabase
        .from("checklist_templates")
        .insert({
          organization_id: tenant.organizationId,
          created_by: authData.user?.id ?? null,
          ...templatePayload,
        })
        .select("id")
        .single();

      template = insertResult.data;
      templateError = insertResult.error;
    } else {
      const updateResult = await supabase
        .from("checklist_templates")
        .update(templatePayload)
        .eq("organization_id", tenant.organizationId)
        .eq("id", templateId)
        .select("id")
        .single();

      template = updateResult.data;
      templateError = updateResult.error;
    }
  } else {
    const insertResult = await supabase
      .from("checklist_templates")
      .insert({
        organization_id: tenant.organizationId,
        created_by: authData.user?.id ?? null,
        ...templatePayload,
      })
      .select("id")
      .single();

    template = insertResult.data;
    templateError = insertResult.error;
  }

  if (templateError || !template) {
    return { success: false, message: `No se pudo crear plantilla: ${templateError?.message ?? "error"}` };
  }

  const { data: oldSections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", template.id);

  const oldSectionIds = (oldSections ?? []).map((row) => row.id);
  if (oldSectionIds.length) {
    await supabase
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .in("section_id", oldSectionIds);

    await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("template_id", template.id);
  }

  let globalItemIndex = 0;
  for (const [sectionIndex, section] of normalizedSections.entries()) {
    const { data: sectionRow, error: sectionError } = await supabase
      .from("checklist_template_sections")
      .insert({
        organization_id: tenant.organizationId,
        template_id: template.id,
        name: section.name,
        sort_order: sectionIndex,
      })
      .select("id")
      .single();

    if (sectionError || !sectionRow) {
      return {
        success: false,
        message: `Plantilla ${templateId ? "actualizada" : "creada"} pero seccion fallo: ${sectionError?.message ?? "error"}`
      };
    }

    const itemsPayload = section.items.map((label, index) => ({
      organization_id: tenant.organizationId,
      section_id: sectionRow.id,
      label,
      priority: normalizePriority(globalItemIndex < 2 ? "high" : "medium"),
      sort_order: index,
    }));
    globalItemIndex += section.items.length;

    const { error: itemsError } = await supabase
      .from("checklist_template_items")
      .insert(itemsPayload);

    if (itemsError) {
      return {
        success: false,
        message: `Plantilla ${templateId ? "actualizada" : "creada"} pero items fallaron: ${itemsError.message}`
      };
    }
  }

  await logAuditEvent({
    action: templateId ? "checklist.template.update" : "checklist.template.create",
    entityType: "checklist_template",
    entityId: template.id,
    organizationId: tenant.organizationId,
    branchId,
    metadata: {
      name,
      checklistType,
      shift,
      department,
      departmentId,
      repeatEvery,
      templateStatus,
      notifyVia,
      notifyChannels,
      checklistTypeOther,
      itemsCount: totalItems,
      sectionsCount: normalizedSections.length,
      preservedHistory,
    },
    eventDomain: "checklists",
    outcome: "success",
    severity: templateId ? "medium" : "high",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");

  if (!templateId && notifyByEmail) {
    await sendChecklistAudienceEmail({
      supabase,
      organizationId: tenant.organizationId,
      templateName: name,
      event: "created",
      itemsCount: totalItems,
      actorEmail: authData.user?.email ?? "Usuario interno",
      targetScope: {
        locations: locationScopes,
        department_ids: departmentScopes,
        position_ids: positionScopes,
        users: userScopes,
      },
      templateBranchId: branchId,
      templateDepartmentId: departmentId,
    });
  }

  return {
    success: true,
    message: templateId
      ? preservedHistory
        ? "Checklist actualizado creando nueva version (se preservo historial)"
        : "Checklist actualizado correctamente"
      : "Plantilla creada correctamente"
  };
}

export async function submitChecklistRunAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) {
    return { success: false, message: "Plantilla invalida" };
  }

  const { data: template, error: templateError } = await supabase
    .from("checklist_templates")
    .select("id, branch_id, department_id, target_scope, name")
    .eq("id", templateId)
    .eq("organization_id", tenant.organizationId)
    .maybeSingle();

  if (templateError || !template) {
    return { success: false, message: "No se encontro la plantilla" };
  }

  const userId = authData.user?.id;
  if (!userId) {
    redirect("/auth/login");
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("department_id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  const canUseTemplate = canUseChecklistTemplateInTenant({
    roleCode: tenant.roleCode,
    userId,
    branchId: tenant.branchId,
    departmentId: employeeRow?.department_id ?? null,
    templateBranchId: template.branch_id,
    templateDepartmentId: template.department_id,
    targetScope: template.target_scope,
  });

  if (!canUseTemplate) {
    return { success: false, message: "No tienes acceso a esta plantilla" };
  }

  const { data: sections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", templateId);

  const sectionIds = (sections ?? []).map((item) => item.id);
  const { data: items } = await supabase
    .from("checklist_template_items")
    .select("id, label")
    .eq("organization_id", tenant.organizationId)
    .in("section_id", sectionIds.length ? sectionIds : ["00000000-0000-0000-0000-000000000000"])
    .order("sort_order");

  if (!items?.length) {
    return { success: false, message: "La plantilla no tiene items" };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("checklist_submissions")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: template.branch_id,
      template_id: templateId,
      submitted_by: authData.user?.id,
      status: "submitted",
      submitted_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (submissionError || !submission) {
    return {
      success: false,
      message: `No se pudo registrar ejecucion: ${submissionError?.message ?? "error"}`
    };
  }

  let flaggedCount = 0;
  for (const item of items) {
    const checked = String(formData.get(`checked_${item.id}`) ?? "") === "on";
    const reason = String(formData.get(`flag_reason_${item.id}`) ?? "").trim();
    const isFlagged = !checked && !!reason;

    const { data: submissionItem, error: itemError } = await supabase
      .from("checklist_submission_items")
      .insert({
        organization_id: tenant.organizationId,
        submission_id: submission.id,
        template_item_id: item.id,
        is_checked: checked,
        is_flagged: isFlagged,
      })
      .select("id")
      .single();

    if (itemError || !submissionItem) {
      return {
        success: false,
        message: `Error guardando items: ${itemError?.message ?? "error"}`
      };
    }

    if (isFlagged) {
      flaggedCount += 1;
      const { error: flagError } = await supabase.from("checklist_flags").insert({
        organization_id: tenant.organizationId,
        submission_item_id: submissionItem.id,
        reported_by: authData.user?.id,
        reason,
        status: "open",
      });

      if (flagError) {
        return { success: false, message: `Error guardando incidencia: ${flagError.message}` };
      }
    }
  }

  await logAuditEvent({
    action: "checklist.submission.create",
    entityType: "checklist_submission",
    entityId: submission.id,
    organizationId: tenant.organizationId,
    branchId: template.branch_id,
    metadata: { templateId, templateName: template.name, itemsCount: items.length, flaggedCount },
    eventDomain: "checklists",
    outcome: "success",
    severity: flaggedCount > 0 ? "high" : "medium",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");

  return {
    success: true,
    message: `Checklist enviado (${items.length} items, ${flaggedCount} incidencias)`
  };
}

export async function reviewChecklistSubmissionAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    return { success: false, message: "No tienes permisos para revisar ejecuciones" };
  }

  const submissionId = String(formData.get("submission_id") ?? "").trim();
  if (!submissionId) {
    return { success: false, message: "Ejecucion invalida" };
  }

  const { error } = await supabase
    .from("checklist_submissions")
    .update({
      status: "reviewed",
      reviewed_by: authData.user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .eq("organization_id", tenant.organizationId);

  if (error) {
    return { success: false, message: `No se pudo revisar ejecucion: ${error.message}` };
  }

  await logAuditEvent({
    action: "checklist.submission.review",
    entityType: "checklist_submission",
    entityId: submissionId,
    organizationId: tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");
  return { success: true, message: "Checklist marcado como revisado" };
}

export async function deleteChecklistTemplateAction(_prevState: unknown, formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    return { success: false, message: "No tienes permisos para eliminar checklists" };
  }

  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) {
    return { success: false, message: "Checklist invalido" };
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, branch_id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!template) {
    return { success: false, message: "Checklist no encontrado" };
  }

  const { count: submissionsCount } = await supabase
    .from("checklist_submissions")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", templateId);

  if ((submissionsCount ?? 0) > 0) {
    const { error: archiveError } = await supabase
      .from("checklist_templates")
      .update({ is_active: false })
      .eq("organization_id", tenant.organizationId)
      .eq("id", templateId);

    if (archiveError) {
      return { success: false, message: `No se pudo archivar checklist: ${archiveError.message}` };
    }

    await logAuditEvent({
      action: "checklist.template.archive",
      entityType: "checklist_template",
      entityId: templateId,
      organizationId: tenant.organizationId,
      branchId: template.branch_id,
      metadata: { name: template.name, reason: "has_submissions", submissionsCount },
      eventDomain: "checklists",
      outcome: "success",
      severity: "high",
    });

    revalidatePath("/app/checklists");
    revalidatePath("/app/reports");
    return { success: true, message: "Checklist archivado (tiene historial de ejecuciones)" };
  }

  const { data: sections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", tenant.organizationId)
    .eq("template_id", templateId);

  const sectionIds = (sections ?? []).map((row) => row.id);
  if (sectionIds.length) {
    const { error: itemsDeleteError } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .in("section_id", sectionIds);

    if (itemsDeleteError) {
      return { success: false, message: `No se pudieron eliminar items: ${itemsDeleteError.message}` };
    }

    const { error: sectionsDeleteError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("template_id", templateId);

    if (sectionsDeleteError) {
      return { success: false, message: `No se pudieron eliminar secciones: ${sectionsDeleteError.message}` };
    }
  }

  const { error: templateDeleteError } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", templateId);

  if (templateDeleteError) {
    return { success: false, message: `No se pudo eliminar checklist: ${templateDeleteError.message}` };
  }

  await logAuditEvent({
    action: "checklist.template.delete",
    entityType: "checklist_template",
    entityId: templateId,
    organizationId: tenant.organizationId,
    branchId: template.branch_id,
    metadata: { name: template.name },
    eventDomain: "checklists",
    outcome: "success",
    severity: "critical",
  });

  revalidatePath("/app/checklists");
  revalidatePath("/app/reports");
  return { success: true, message: "Checklist eliminado" };
}
