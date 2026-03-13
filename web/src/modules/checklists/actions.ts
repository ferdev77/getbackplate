"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { canUseChecklistTemplateInTenant } from "@/shared/lib/checklist-access";
import { normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";

function qs(message: string) {
  return encodeURIComponent(message);
}

function normalizeChecklistType(value: string) {
  const type = value.trim().toLowerCase();
  if (["opening", "closing", "prep", "custom"].includes(type)) {
    return type;
  }
  return "custom";
}

function normalizeTemplateStatus(value: string) {
  const status = value.trim().toLowerCase();
  if (status === "draft") return "draft";
  return "active";
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizePriority(value: string) {
  const priority = value.trim().toLowerCase();
  if (["low", "medium", "high"].includes(priority)) {
    return priority;
  }
  return "medium";
}

export async function createChecklistTemplateAction(formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();
  const templateId = String(formData.get("template_id") ?? "").trim() || null;

  const name = String(formData.get("name") ?? "").trim();
  const checklistType = normalizeChecklistType(String(formData.get("checklist_type") ?? "custom"));
  const checklistTypeOther = String(formData.get("checklist_type_other") ?? "").trim();
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  const shift = String(formData.get("shift") ?? "").trim() || null;
  const departmentId = String(formData.get("department_id") ?? "").trim() || null;
  let department: string | null = String(formData.get("department") ?? "").trim() || null;
  const repeatEvery = String(formData.get("repeat_every") ?? "daily").trim() || "daily";
  const templateStatus = normalizeTemplateStatus(String(formData.get("template_status") ?? "active"));
  const notifyVia = unique(formData.getAll("notify_via").map(String).filter((value) => value === "whatsapp" || value === "sms"));
  const locationScopes = normalizeScopeSelection(formData.getAll("location_scope").map(String));
  const departmentScopes = normalizeScopeSelection(formData.getAll("department_scope").map(String));
  const positionScopes = normalizeScopeSelection(formData.getAll("position_scope").map(String));
  const userScopes = normalizeScopeSelection(formData.getAll("user_scope").map(String));
  const sectionsPayloadRaw = String(formData.get("sections_payload") ?? "").trim();
  const itemsInput = String(formData.get("items") ?? "").trim();

  let normalizedSections: Array<{ name: string; items: string[] }> = [];

  if (sectionsPayloadRaw) {
    try {
      const parsed = JSON.parse(sectionsPayloadRaw);
      if (Array.isArray(parsed)) {
        normalizedSections = parsed
          .map((section: any) => ({
            name: typeof section?.name === "string" && section.name.trim() ? section.name.trim() : "General",
            items: Array.isArray(section?.items)
              ? section.items.map((item: any) => String(item).trim()).filter(Boolean)
              : [],
          }))
          .filter((section) => section.items.length > 0)
          .slice(0, 20);
      }
    } catch {
      redirect("/app/checklists?status=error&message=" + qs("Formato de secciones (JSON) invalido"));
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
    redirect("/app/checklists?status=error&message=" + qs("Nombre de plantilla obligatorio"));
  }

  if (!totalItems) {
    redirect("/app/checklists?status=error&message=" + qs("Agrega al menos un item de checklist"));
  }

  if (branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .maybeSingle();

    if (branchError || !branch) {
      redirect("/app/checklists?status=error&message=" + qs("Locacion base invalida para esta empresa"));
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
      redirect("/app/checklists?status=error&message=" + qs("Departamento base invalido para esta empresa"));
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
      redirect("/app/checklists?status=error&message=" + qs("No se encontro la plantilla a editar"));
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
    redirect(
      "/app/checklists?status=error&message=" +
        qs(`No se pudo crear plantilla: ${templateError?.message ?? "error"}`),
    );
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
      redirect(
        "/app/checklists?status=error&message=" +
          qs(`Plantilla ${templateId ? "actualizada" : "creada"} pero seccion fallo: ${sectionError?.message ?? "error"}`),
      );
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
      redirect(
        "/app/checklists?status=error&message=" +
          qs(`Plantilla ${templateId ? "actualizada" : "creada"} pero items fallaron: ${itemsError.message}`),
      );
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
  redirect(
    "/app/checklists?status=success&message=" +
      qs(
        templateId
          ? preservedHistory
            ? "Checklist actualizado creando nueva version (se preservo historial)"
            : "Checklist actualizado correctamente"
          : "Plantilla creada correctamente",
      ),
  );
}

export async function submitChecklistRunAction(formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) {
    redirect("/app/checklists?status=error&message=" + qs("Plantilla invalida"));
  }

  const { data: template, error: templateError } = await supabase
    .from("checklist_templates")
    .select("id, branch_id, department_id, target_scope, name")
    .eq("id", templateId)
    .eq("organization_id", tenant.organizationId)
    .maybeSingle();

  if (templateError || !template) {
    redirect("/app/checklists?status=error&message=" + qs("No se encontro la plantilla"));
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
    redirect("/app/checklists?status=error&message=" + qs("No tienes acceso a esta plantilla"));
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
    redirect("/app/checklists?status=error&message=" + qs("La plantilla no tiene items"));
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
    redirect(
      "/app/checklists?status=error&message=" +
        qs(`No se pudo registrar ejecucion: ${submissionError?.message ?? "error"}`),
    );
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
      redirect(
        "/app/checklists?status=error&message=" +
          qs(`Error guardando items: ${itemError?.message ?? "error"}`),
      );
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
        redirect(
          "/app/checklists?status=error&message=" +
            qs(`Error guardando incidencia: ${flagError.message}`),
        );
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
  redirect(
    "/app/checklists?status=success&message=" +
      qs(`Checklist enviado (${items.length} items, ${flaggedCount} incidencias)`),
  );
}

export async function reviewChecklistSubmissionAction(formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    redirect("/app/checklists?status=error&message=" + qs("No tienes permisos para revisar ejecuciones"));
  }

  const submissionId = String(formData.get("submission_id") ?? "").trim();
  if (!submissionId) {
    redirect("/app/checklists?status=error&message=" + qs("Ejecucion invalida"));
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
    redirect(
      "/app/checklists?status=error&message=" +
        qs(`No se pudo revisar ejecucion: ${error.message}`),
    );
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
  redirect("/app/checklists?status=success&message=" + qs("Checklist marcado como revisado"));
}

export async function deleteChecklistTemplateAction(formData: FormData) {
  const tenant = await requireTenantModule("checklists");
  const supabase = await createSupabaseServerClient();

  if (tenant.roleCode !== "company_admin" && tenant.roleCode !== "manager") {
    redirect("/app/checklists?status=error&message=" + qs("No tienes permisos para eliminar checklists"));
  }

  const templateId = String(formData.get("template_id") ?? "").trim();
  if (!templateId) {
    redirect("/app/checklists?status=error&message=" + qs("Checklist invalido"));
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, branch_id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!template) {
    redirect("/app/checklists?status=error&message=" + qs("Checklist no encontrado"));
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
      redirect("/app/checklists?status=error&message=" + qs(`No se pudo archivar checklist: ${archiveError.message}`));
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
    redirect("/app/checklists?status=success&message=" + qs("Checklist archivado (tiene historial de ejecuciones)"));
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
      redirect("/app/checklists?status=error&message=" + qs(`No se pudieron eliminar items: ${itemsDeleteError.message}`));
    }

    const { error: sectionsDeleteError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", tenant.organizationId)
      .eq("template_id", templateId);

    if (sectionsDeleteError) {
      redirect("/app/checklists?status=error&message=" + qs(`No se pudieron eliminar secciones: ${sectionsDeleteError.message}`));
    }
  }

  const { error: templateDeleteError } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", templateId);

  if (templateDeleteError) {
    redirect("/app/checklists?status=error&message=" + qs(`No se pudo eliminar checklist: ${templateDeleteError.message}`));
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
  redirect("/app/checklists?status=success&message=" + qs("Checklist eliminado"));
}
