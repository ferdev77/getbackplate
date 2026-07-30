import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertScopeIntent, normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";
import {
  isTextOnlyChecklistEdit,
  sectionItemLabels,
  type ChecklistSection,
} from "@/modules/checklists/lib/sections";

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
  normalizedSections: ChecklistSection[];
  notifyVia: Array<"sms">;
  /**
   * Forzar que los items se apliquen ya, aunque la vuelta actual tenga
   * respuestas. Es la salida del aviso "se aplican en el proximo reparto".
   */
  applyNow?: boolean;
  /**
   * Intencion declarada por la pantalla ("all" | "group" | "people"). Sirve para
   * distinguir un alcance vacio a proposito de uno a medio llenar. Ver
   * assertScopeIntent.
   */
  scopeMode?: unknown;
};

export type UpsertChecklistTemplateResult =
  | {
      ok: true;
      templateId: string;
      preservedHistory: boolean;
      totalItems: number;
      /** Cuando los items quedaron pendientes, momento en que se aplicaran. */
      pendingUntil?: string;
    }
  | { ok: false; message: string; redirect?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function normalizePriority(value: string) {
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

/**
 * Reemplaza las secciones e items de una plantilla por los que habian quedado
 * pendientes, y limpia la marca de pendiente.
 *
 * La llama el cron de recurrencia al iniciar una vuelta nueva. Los items
 * anteriores se borran: el historial no los necesita porque cada respuesta
 * guarda su propio texto (migracion 20260730000001).
 */
export async function applyPendingChecklistSections(params: {
  supabase: SupabaseClient;
  organizationId: string;
  templateId: string;
  sections: ChecklistSection[];
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, organizationId, templateId, sections } = params;

  const { data: oldSections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId);

  const oldSectionIds = (oldSections ?? []).map((row) => row.id);
  if (oldSectionIds.length) {
    const { error: itemsError } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", organizationId)
      .in("section_id", oldSectionIds);
    if (itemsError) return { ok: false, message: itemsError.message };

    const { error: sectionsError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", organizationId)
      .eq("template_id", templateId);
    if (sectionsError) return { ok: false, message: sectionsError.message };
  }

  for (const [index, section] of sections.entries()) {
    const { data: sectionRow, error: sectionError } = await supabase
      .from("checklist_template_sections")
      .insert({
        organization_id: organizationId,
        template_id: templateId,
        name: section.name,
        sort_order: index,
      })
      .select("id")
      .single();

    if (sectionError || !sectionRow) {
      return { ok: false, message: sectionError?.message ?? "no se pudo crear la seccion" };
    }

    if (!section.items.length) continue;

    const { error: itemsError } = await supabase
      .from("checklist_template_items")
      .insert(
        sectionItemLabels(section).map((label, itemIndex) => ({
          organization_id: organizationId,
          section_id: sectionRow.id,
          label,
          priority: normalizePriority("medium"),
          sort_order: itemIndex,
        })),
      );

    if (itemsError) return { ok: false, message: itemsError.message };
  }

  const { error: clearError } = await supabase
    .from("checklist_templates")
    .update({ pending_sections: null, pending_since: null })
    .eq("organization_id", organizationId)
    .eq("id", templateId);

  if (clearError) return { ok: false, message: clearError.message };

  return { ok: true };
}

/**
 * Deja el reparto programado del checklist en sincronia con su frecuencia.
 *
 * Vive aparte porque el portal de empleado tiene su propia ruta de alta y
 * edicion: sin esto, un checklist creado por un empleado mostraba "Diaria" y
 * nunca se repartia, porque nadie le creaba el scheduled_job.
 */
export async function syncChecklistScheduledJob(params: {
  supabase: SupabaseClient;
  organizationId: string;
  templateId: string;
  recurrenceType: string;
  customDays: number[];
  isActive: boolean;
}) {
  const { supabase, organizationId, templateId, recurrenceType, customDays, isActive } = params;

  const { data: existingJob } = await supabase
    .from("scheduled_jobs")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("job_type", "checklist_generator")
    .eq("target_id", templateId)
    .maybeSingle();

  const shouldRun = recurrenceType !== "none" && isActive;

  if (existingJob) {
    if (shouldRun) {
      const nextRun = calculateNextRunAt(recurrenceType as RecurrenceType, null, customDays);
      await supabase
        .from("scheduled_jobs")
        .update({
          recurrence_type: recurrenceType,
          custom_days: customDays,
          next_run_at: nextRun.toISOString(),
        })
        .eq("id", existingJob.id);
      return;
    }

    // Sin frecuencia o con el checklist inactivo, el reparto no debe existir.
    await supabase.from("scheduled_jobs").delete().eq("id", existingJob.id);
    return;
  }

  if (shouldRun) {
    const nextRun = calculateNextRunAt(recurrenceType as RecurrenceType, null, customDays);
    await supabase.from("scheduled_jobs").insert({
      organization_id: organizationId,
      job_type: "checklist_generator",
      target_id: templateId,
      recurrence_type: recurrenceType,
      custom_days: customDays,
      next_run_at: nextRun.toISOString(),
    });
  }
}

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
    return { ok: false, message: "Template name is required" };
  }

  if (!totalItems) {
    return { ok: false, message: "Add at least one checklist item" };
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
      return { ok: false, message: "Invalid base location for this organization" };
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
      return { ok: false, message: "Invalid base department for this organization" };
    }

    department = departmentRow.name;
  }

  const intentCheck = assertScopeIntent({
    intent: input.scopeMode,
    locationIds: locationScopes,
    departmentIds: departmentScopes,
    positionIds: positionScopes,
    userIds: userScopes,
  });
  if (!intentCheck.ok) {
    return { ok: false, message: intentCheck.message };
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
      locations: "Some selected scope locations are invalid",
      departments: "Some selected scope departments are invalid",
      positions: "Some selected scope positions are invalid",
      users: "Some selected users are invalid",
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
      return { ok: false, message: "The template to edit was not found" };
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
    return { ok: false, message: `Unable to create template: ${templateError?.message ?? "error"}` };
  }

  // ── Los items no se cambian al medio de una vuelta que ya tiene respuestas ──
  //
  // Si dos personas responden la misma vuelta con listas distintas, el resultado
  // del dia queda inconsistente y no se puede comparar. Asi que al editar una
  // plantilla que ya recibio respuestas en la vuelta actual:
  //   · con frecuencia definida -> los items quedan pendientes y el cron los
  //     aplica al iniciar la vuelta siguiente;
  //   · sin frecuencia -> no hay proxima vuelta donde aplicarlos, se bloquea.
  //
  // El resto de la plantilla (nombre, tipo, turno, alcance) ya se guardo arriba:
  // solo se posterga la lista de items, que es lo que rompe la comparacion.
  // Corregir el texto de un item no cambia QUE se controla, solo como esta
  // escrito, asi que no hay razon para hacerte esperar un dia por un error de
  // tipeo. Solo se difiere cuando se agrega o se quita algo.
  //
  // Sin identificadores de item en el payload no se puede distinguir con
  // exactitud un renombre de un alta+baja, asi que se compara la estructura:
  // Corregir el texto de un item se aplica ya; agregar o quitar se difiere al
  // proximo reparto. La distincion es exacta porque el formulario devuelve el id
  // de cada item que ya existia (ver isTextOnlyChecklistEdit).
  let onlyTextEdits = false;
  if (templateId) {
    const { data: previousSections } = await supabase
      .from("checklist_template_sections")
      .select("id, name, sort_order")
      .eq("organization_id", organizationId)
      .eq("template_id", template.id)
      .order("sort_order", { ascending: true });

    const previousSectionIds = (previousSections ?? []).map((row) => row.id);
    const { data: previousItems } = previousSectionIds.length
      ? await supabase
          .from("checklist_template_items")
          .select("id, section_id")
          .eq("organization_id", organizationId)
          .in("section_id", previousSectionIds)
      : { data: [] as Array<{ id: string; section_id: string }> };

    const itemIdsBySectionId = new Map<string, string[]>();
    for (const row of previousItems ?? []) {
      const list = itemIdsBySectionId.get(row.section_id) ?? [];
      list.push(row.id);
      itemIdsBySectionId.set(row.section_id, list);
    }

    onlyTextEdits = isTextOnlyChecklistEdit({
      previousSections: (previousSections ?? []).map((row) => ({
        name: row.name,
        itemIds: itemIdsBySectionId.get(row.id) ?? [],
      })),
      nextSections: normalizedSections,
    });
  }

  if (templateId && !input.applyNow && !onlyTextEdits) {
    const { data: cycleSubmissions, error: cycleError } = await supabase.rpc(
      "checklist_current_cycle_submissions",
      { p_organization_id: organizationId, p_template_id: template.id },
    );

    if (cycleError) {
      return { ok: false, message: `No se pudo verificar el estado del checklist: ${cycleError.message}` };
    }

    const responsesInCycle = typeof cycleSubmissions === "number" ? cycleSubmissions : 0;

    if (responsesInCycle > 0) {
      const { data: job } = await supabase
        .from("scheduled_jobs")
        .select("next_run_at")
        .eq("organization_id", organizationId)
        .eq("job_type", "checklist_generator")
        .eq("target_id", template.id)
        .maybeSingle();

      if (!job?.next_run_at) {
        return {
          ok: false,
          message:
            `No se pueden cambiar los items: este checklist ya tiene ${responsesInCycle} ` +
            `${responsesInCycle === 1 ? "respuesta" : "respuestas"} y no tiene una frecuencia definida, ` +
            "asi que no hay un proximo reparto donde aplicarlos sin mezclar los resultados. " +
            "Podes duplicarlo como checklist nuevo, o asignarle una frecuencia y editarlo despues.",
        };
      }

      const { error: pendingError } = await supabase
        .from("checklist_templates")
        .update({
          pending_sections: normalizedSections,
          pending_since: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", template.id);

      if (pendingError) {
        return { ok: false, message: `No se pudieron guardar los cambios pendientes: ${pendingError.message}` };
      }

      return {
        ok: true,
        templateId: template.id,
        preservedHistory: true,
        totalItems,
        pendingUntil: job.next_run_at,
      };
    }
  }

  // Al aplicar ya, cualquier cambio pendiente anterior queda sin efecto.
  if (templateId) {
    await supabase
      .from("checklist_templates")
      .update({ pending_sections: null, pending_since: null })
      .eq("organization_id", organizationId)
      .eq("id", template.id);
  }

  // Clean old sections & items
  const { data: oldSections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", template.id);

  const oldSectionIds = (oldSections ?? []).map((row) => row.id);
  if (oldSectionIds.length) {
    // Estos borrados NO se chequeaban. Cuando la plantilla ya tenia respuestas,
    // la FK desde checklist_submission_items los bloqueaba, el error se
    // ignoraba y mas abajo se insertaban las secciones e items nuevos: quedaban
    // los dos juegos y la plantilla terminaba con todo duplicado, sin ningun
    // aviso. Reproducido en dev: 2 items + 1 respuesta -> 5 items y 2 secciones.
    //
    // La migracion 20260730000001 quito ese bloqueo (el historial ahora guarda
    // su propio texto), pero el guardado igual tiene que fallar fuerte si el
    // borrado no se puede hacer, en lugar de duplicar en silencio.
    const { error: itemsDeleteError } = await supabase
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", organizationId)
      .in("section_id", oldSectionIds);

    if (itemsDeleteError) {
      return {
        ok: false,
        message: `No se pudieron reemplazar los items del checklist: ${itemsDeleteError.message}`,
      };
    }

    const { error: sectionsDeleteError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", organizationId)
      .eq("template_id", template.id);

    if (sectionsDeleteError) {
      return {
        ok: false,
        message: `No se pudieron reemplazar las secciones del checklist: ${sectionsDeleteError.message}`,
      };
    }
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
        message: `Template ${templateId ? "updated" : "created"}, but the section failed: ${sectionError?.message ?? "error"}`
      };
    }

    const itemsPayload = sectionItemLabels(section).map((label, index) => ({
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
        message: `Template ${templateId ? "updated" : "created"}, but the items failed: ${itemsError.message}`
      };
    }
  }

  await syncChecklistScheduledJob({
    supabase,
    organizationId,
    templateId: template.id,
    recurrenceType,
    customDays,
    isActive: templateStatus === "active",
  });

  return { ok: true, templateId: template.id, preservedHistory, totalItems };
}

// ---------------------------------------------------------------------------
// Delete Template (archive if has submissions, hard delete otherwise)
// ---------------------------------------------------------------------------

export type DeleteChecklistTemplateResult =
  | {
      ok: true;
      message: string;
      /** Respuestas que quedaron en el historial despues de borrar la plantilla. */
      keptSubmissions: number;
    }
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
    return { ok: false, message: "Checklist not found" };
  }

  const { count: submissionsCount, error: countError } = await supabase
    .from("checklist_submissions")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", organizationId)
    .eq("template_id", templateId);

  if (countError) {
    return { ok: false, message: `Unable to check checklist history: ${countError.message}` };
  }

  /**
   * Se borra aunque tenga respuestas. El historial no se pierde: cada respuesta
   * guarda el nombre del checklist y el texto de sus items (migraciones
   * 20260730000001 y 20260731000001), y su template_id queda en null por la FK
   * en SET NULL. Antes esto se archivaba porque la FK lo impedia, y una
   * plantilla con historial quedaba para siempre en la lista como inactiva.
   */
  const submissions = submissionsCount ?? 0;

  // Borrado de secciones → items → plantilla
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
      return { ok: false, message: `Unable to delete items: ${itemsDeleteError.message}` };
    }

    const { error: sectionsDeleteError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", organizationId)
      .eq("template_id", templateId);

    if (sectionsDeleteError) {
      return { ok: false, message: `Unable to delete sections: ${sectionsDeleteError.message}` };
    }
  }

  const { error: templateDeleteError } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", templateId);

  if (templateDeleteError) {
    return { ok: false, message: `Unable to delete checklist: ${templateDeleteError.message}` };
  }

  return {
    ok: true,
    message:
      submissions > 0
        ? `Checklist eliminado. Se conservan ${submissions} ${submissions === 1 ? "respuesta" : "respuestas"} en el historial.`
        : "Checklist eliminado.",
    keptSubmissions: submissions,
  };
}
