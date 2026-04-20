import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type UpsertChecklistTemplateInput = {
  supabase: SupabaseClient;
  organizationId: string;
  createdBy: string | null;
  templateId: string | null;
  name: string;
  checklistType: string;
  checklistTypeOther: string | undefined;
  branchId: string | null;
  shift: string | null;
  departmentId: string | null;
  department: string | null;
  repeatEvery: string;
  recurrenceType: string;
  customDays: number[];
  templateStatus: string;
  locationScopes: string[];
  departmentScopes: string[];
  positionScopes: string[];
  userScopes: string[];
  normalizedSections: Array<{ name: string; items: string[] }>;
  notifyVia: Array<"whatsapp" | "sms">;
};

export type UpsertChecklistTemplateResult =
  | { ok: true; templateId: string; preservedHistory: boolean; totalItems: number }
  | { ok: false; message: string; redirect?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePriority(value: string) {
  const priority = value.trim().toLowerCase();
  if (["low", "medium", "high"].includes(priority)) {
    return priority;
  }
  return "medium";
}

function qs(message: string) {
  return encodeURIComponent(message);
}

// ---------------------------------------------------------------------------
// Upsert Template (Create or Update)
// ---------------------------------------------------------------------------

export async function upsertChecklistTemplate(
  input: UpsertChecklistTemplateInput,
): Promise<UpsertChecklistTemplateResult> {
  const {
    supabase,
    organizationId,
    createdBy,
    templateId,
    name,
    checklistType,
    checklistTypeOther,
    shift,
    repeatEvery,
    recurrenceType,
    customDays,
    templateStatus,
    normalizedSections,
    notifyVia,
  } = input;

  const { branchId, departmentId } = input;
  let { department } = input;
  const locationScopes = normalizeScopeSelection(input.locationScopes);
  const departmentScopes = normalizeScopeSelection(input.departmentScopes);
  const positionScopes = normalizeScopeSelection(input.positionScopes);
  const userScopes = normalizeScopeSelection(input.userScopes);

  const totalItems = normalizedSections.reduce((acc, section) => acc + section.items.length, 0);

  if (!name) {
    return { ok: false, message: "Nombre de plantilla obligatorio" };
  }

  if (!totalItems) {
    return { ok: false, message: "Agrega al menos un item de checklist" };
  }

  // Validate branch
  if (branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("id", branchId)
      .maybeSingle();

    if (branchError || !branch) {
      return { ok: false, message: "Locación base inválida para esta empresa" };
    }
  }

  // Validate department
  if (departmentId) {
    const { data: departmentRow, error: departmentError } = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (departmentError || !departmentRow) {
      return { ok: false, message: "Departamento base inválido para esta empresa" };
    }

    department = departmentRow.name;
  }

  // Validate scope references
  const scopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId,
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
    return {
      ok: false,
      message: messageByField[scopeValidation.field],
      redirect:
        "/app/checklists?status=error&message=" +
        qs(messageByField[scopeValidation.field]),
    };
  }

  // Build template payload
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
      .eq("organization_id", organizationId)
      .eq("id", templateId)
      .maybeSingle();

    if (!existingTemplate) {
      return { ok: false, message: "No se encontro la plantilla a editar" };
    }

    const { data: hasSubmissions } = await supabase
      .from("checklist_submissions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("template_id", templateId)
      .limit(1)
      .maybeSingle();

    if (hasSubmissions) {
      preservedHistory = true;
      await supabase
        .from("checklist_templates")
        .update({ is_active: false })
        .eq("organization_id", organizationId)
        .eq("id", templateId);

      const insertResult = await supabase
        .from("checklist_templates")
        .insert({
          organization_id: organizationId,
          created_by: createdBy,
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
        .eq("organization_id", organizationId)
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
        organization_id: organizationId,
        created_by: createdBy,
        ...templatePayload,
      })
      .select("id")
      .single();

    template = insertResult.data;
    templateError = insertResult.error;
  }

  if (templateError || !template) {
    return { ok: false, message: `No se pudo crear plantilla: ${templateError?.message ?? "error"}` };
  }

  // Clean old sections & items
  const { data: oldSections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", template.id);

  const oldSectionIds = (oldSections ?? []).map((row) => row.id);
  if (oldSectionIds.length) {
    await supabase
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", organizationId)
      .in("section_id", oldSectionIds);

    await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", organizationId)
      .eq("template_id", template.id);
  }

  // Insert new sections & items
  for (const [sectionIndex, section] of normalizedSections.entries()) {
    const { data: sectionRow, error: sectionError } = await supabase
      .from("checklist_template_sections")
      .insert({
        organization_id: organizationId,
        template_id: template.id,
        name: section.name,
        sort_order: sectionIndex,
      })
      .select("id")
      .single();

    if (sectionError || !sectionRow) {
      return {
        ok: false,
        message: `Plantilla ${templateId ? "actualizada" : "creada"} pero seccion fallo: ${sectionError?.message ?? "error"}`
      };
    }

    const itemsPayload = section.items.map((label, index) => ({
      organization_id: organizationId,
      section_id: sectionRow.id,
      label,
      priority: normalizePriority("medium"),
      sort_order: index,
    }));

    const { error: itemsError } = await supabase
      .from("checklist_template_items")
      .insert(itemsPayload);

    if (itemsError) {
      return {
        ok: false,
        message: `Plantilla ${templateId ? "actualizada" : "creada"} pero items fallaron: ${itemsError.message}`
      };
    }
  }

  // Handle recurrence / scheduled_jobs
  if (template.id) {
    const nextRun = calculateNextRunAt(recurrenceType as RecurrenceType, null, customDays);
    
    // Attempt to update or create
    const { data: existingJob } = await supabase
      .from("scheduled_jobs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("job_type", "checklist_generator")
      .eq("target_id", template.id)
      .maybeSingle();

    if (existingJob) {
      if (templateStatus === "active") {
        await supabase.from("scheduled_jobs").update({
          recurrence_type: recurrenceType,
          custom_days: customDays,
          next_run_at: nextRun.toISOString()
        }).eq("id", existingJob.id);
      } else {
        await supabase.from("scheduled_jobs").delete().eq("id", existingJob.id);
      }
    } else if (templateStatus === "active") {
      await supabase.from("scheduled_jobs").insert({
        organization_id: organizationId,
        job_type: "checklist_generator",
        target_id: template.id,
        recurrence_type: recurrenceType,
        custom_days: customDays,
        next_run_at: nextRun.toISOString()
      });
    }
  }

  return { ok: true, templateId: template.id, preservedHistory, totalItems };
}

// ---------------------------------------------------------------------------
// Delete Template (archive if has submissions, hard delete otherwise)
// ---------------------------------------------------------------------------

export type DeleteChecklistTemplateResult =
  | { ok: true; message: string; archived: boolean }
  | { ok: false; message: string };

export async function deleteChecklistTemplate(params: {
  supabase: SupabaseClient;
  organizationId: string;
  templateId: string;
}): Promise<DeleteChecklistTemplateResult> {
  const { supabase, organizationId, templateId } = params;

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, branch_id")
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!template) {
    return { ok: false, message: "Checklist no encontrado" };
  }

  const { count: submissionsCount } = await supabase
    .from("checklist_submissions")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", organizationId)
    .eq("template_id", templateId);

  // Archive if has submissions
  if ((submissionsCount ?? 0) > 0) {
    const { error: archiveError } = await supabase
      .from("checklist_templates")
      .update({ is_active: false })
      .eq("organization_id", organizationId)
      .eq("id", templateId);

    if (archiveError) {
      return { ok: false, message: `No se pudo archivar checklist: ${archiveError.message}` };
    }

    return {
      ok: true,
      message: "Checklist archivado (tiene historial de ejecuciones)",
      archived: true,
    };
  }

  // Hard delete sections → items → template
  const { data: sections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId);

  const sectionIds = (sections ?? []).map((row) => row.id);
  if (sectionIds.length) {
    const { error: itemsDeleteError } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", organizationId)
      .in("section_id", sectionIds);

    if (itemsDeleteError) {
      return { ok: false, message: `No se pudieron eliminar items: ${itemsDeleteError.message}` };
    }

    const { error: sectionsDeleteError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", organizationId)
      .eq("template_id", templateId);

    if (sectionsDeleteError) {
      return { ok: false, message: `No se pudieron eliminar secciones: ${sectionsDeleteError.message}` };
    }
  }

  const { error: templateDeleteError } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", templateId);

  if (templateDeleteError) {
    return { ok: false, message: `No se pudo eliminar checklist: ${templateDeleteError.message}` };
  }

  return {
    ok: true,
    message: "Checklist eliminado",
    archived: false,
  };
}
