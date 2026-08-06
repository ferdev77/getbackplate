import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertScopeIntent, normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { resolveUserLocale } from "@/shared/lib/locale";
import { createChecklistsTranslator } from "@/modules/checklists/checklists.i18n";
import { calculateNextRunAt, RecurrenceType } from "@/shared/lib/cron-utils";
import {
  isTextOnlyChecklistEdit,
  type ChecklistSection,
} from "@/modules/checklists/lib/sections";
import {
  normalizeChecklistNotificationChannels,
  type ChecklistNotificationChannel,
} from "@/modules/checklists/lib/notification-channels";

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
  /** Undefined on edits that must preserve the currently persisted channels. */
  notifyChannels?: ChecklistNotificationChannel[];
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

export function decideChecklistSectionUpdate(input: {
  isEdit: boolean;
  onlyTextEdits: boolean;
  responsesInCurrentCycle: number;
  recurrenceType: string;
  isActive: boolean;
}): "immediate" | "defer" | "reject" {
  if (!input.isEdit || input.onlyTextEdits || input.responsesInCurrentCycle === 0) {
    return "immediate";
  }
  return input.isActive && input.recurrenceType !== "none" ? "defer" : "reject";
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
  const { error } = await supabase.rpc("replace_checklist_sections_transaction", {
    p_organization_id: organizationId,
    p_template_id: templateId,
    p_sections: sections,
    p_expected_cycle_submissions: null,
  });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/**
 * Cuantos items tiene hoy una plantilla.
 *
 * El conteo solo existia como resultado de guardar (`totalItems` del upsert),
 * asi que el reparto automatico no tenia de donde sacarlo y su aviso siempre
 * decia "0 ítems". Se cuenta contra la base para que el numero sea el de la
 * vuelta que se esta repartiendo.
 */
export async function contarItemsDeLaPlantilla(params: {
  supabase: SupabaseClient;
  organizationId: string;
  templateId: string;
}): Promise<number> {
  const { supabase, organizationId, templateId } = params;

  const { data: sections } = await supabase
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId);

  const sectionIds = (sections ?? []).map((row) => row.id);
  if (!sectionIds.length) return 0;

  const { count } = await supabase
    .from("checklist_template_items")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("section_id", sectionIds);

  return count ?? 0;
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
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { supabase, organizationId, templateId, recurrenceType, customDays, isActive } = params;

  const shouldRun = recurrenceType !== "none" && isActive;

  if (shouldRun) {
    const nextRun = calculateNextRunAt(recurrenceType as RecurrenceType, null, customDays);
    const { error } = await supabase.from("scheduled_jobs").upsert(
      {
        organization_id: organizationId,
        job_type: "checklist_generator",
        target_id: templateId,
        recurrence_type: recurrenceType,
        custom_days: customDays,
        next_run_at: nextRun.toISOString(),
      },
      { onConflict: "organization_id,job_type,target_id" },
    );
    return error ? { ok: false, message: error.message } : { ok: true };
  }

  const { error } = await supabase
    .from("scheduled_jobs")
    .delete()
    .eq("organization_id", organizationId)
    .eq("job_type", "checklist_generator")
    .eq("target_id", templateId);
  return error ? { ok: false, message: error.message } : { ok: true };
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
    notifyChannels,
  } = input;

  const { branchId, departmentId } = input;
  let { department } = input;
  const locationScopes = normalizeScopeSelection(input.locationScopes);
  const departmentScopes = normalizeScopeSelection(input.departmentScopes);
  const positionScopes = normalizeScopeSelection(input.positionScopes);
  const userScopes = normalizeScopeSelection(input.userScopes);

  const totalItems = normalizedSections.reduce((acc, section) => acc + section.items.length, 0);

  // Los mensajes se escriben en español y el diccionario del modulo los pasa a
  // ingles cuando corresponde (planes de integracion). Ver checklists.i18n.ts.
  const t = createChecklistsTranslator(
    await resolveUserLocale({ organizationId, userId: createdBy }),
  );

  if (!name) {
    return { ok: false, message: t("Ingresa un nombre para el checklist") };
  }

  if (!totalItems) {
    return { ok: false, message: t("Agrega al menos un ítem") };
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
      return { ok: false, message: t("La locación base no pertenece a esta organización") };
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
      return { ok: false, message: t("El departamento base no pertenece a esta organización") };
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
      locations: t("Algunas locaciones seleccionadas no son válidas"),
      departments: t("Algunos departamentos seleccionados no son válidos"),
      positions: t("Algunos puestos seleccionados no son válidos"),
      users: t("Algunos usuarios seleccionados no son válidos"),
    } as const;
    return {
      ok: false,
      message: messageByField[scopeValidation.field],
      redirect:
        "/app/checklists?status=error&message=" +
        qs(messageByField[scopeValidation.field]),
    };
  }

  let existingTargetScope: unknown = null;
  let preservedHistory = false;
  let onlyTextEdits = false;
  let responsesInCycle = 0;

  // Classify the edit against the original template before writing anything.
  // History snapshots make replacement template IDs unnecessary.
  if (templateId) {
    const { data: existingTemplate, error: existingTemplateError } = await supabase
      .from("checklist_templates")
      .select("id, target_scope")
      .eq("organization_id", organizationId)
      .eq("id", templateId)
      .maybeSingle();

    if (existingTemplateError || !existingTemplate) {
      return { ok: false, message: t("No se encontró el checklist que se quiere editar") };
    }
    existingTargetScope = existingTemplate.target_scope;

    const [{ data: hasSubmissions, error: submissionsError }, { data: previousSections, error: sectionsError }] = await Promise.all([
      supabase
        .from("checklist_submissions")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("template_id", templateId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("checklist_template_sections")
        .select("id, name, sort_order")
        .eq("organization_id", organizationId)
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true }),
    ]);

    if (submissionsError || sectionsError) {
      return {
        ok: false,
        message: `${t("No se pudo verificar el estado del checklist")}: ${submissionsError?.message ?? sectionsError?.message}`,
      };
    }
    preservedHistory = Boolean(hasSubmissions);

    const previousSectionIds = (previousSections ?? []).map((row) => row.id);
    const { data: previousItems, error: itemsError } = previousSectionIds.length
      ? await supabase
          .from("checklist_template_items")
          .select("id, section_id")
          .eq("organization_id", organizationId)
          .in("section_id", previousSectionIds)
      : { data: [] as Array<{ id: string; section_id: string }>, error: null };

    if (itemsError) {
      return { ok: false, message: `${t("No se pudo verificar el estado del checklist")}: ${itemsError.message}` };
    }

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

    if (!onlyTextEdits) {
      const { data: cycleSubmissions, error: cycleError } = await supabase.rpc(
        "checklist_current_cycle_submissions",
        { p_organization_id: organizationId, p_template_id: templateId },
      );
      if (cycleError) {
        return {
          ok: false,
          message: `${t("No se pudo verificar el estado del checklist")}: ${cycleError.message}`,
        };
      }
      responsesInCycle = typeof cycleSubmissions === "number" ? cycleSubmissions : 0;
    }
  }

  const isActive = templateStatus === "active";
  const sectionUpdate = decideChecklistSectionUpdate({
    isEdit: Boolean(templateId),
    onlyTextEdits,
    responsesInCurrentCycle: responsesInCycle,
    recurrenceType,
    isActive,
  });

  if (sectionUpdate === "reject") {
    return {
      ok: false,
      message: t(
        "No se pueden cambiar los ítems: este checklist ya tiene {n} {respuestas} y no tiene una frecuencia definida, así que no hay un próximo reparto donde aplicarlos sin mezclar los resultados. Puedes duplicarlo como un checklist nuevo o asignarle una frecuencia y editarlo después.",
      )
        .replace("{n}", String(responsesInCycle))
        .replace("{respuestas}", t(responsesInCycle === 1 ? "respuesta" : "respuestas")),
    };
  }

  const persistedNotifyChannels = notifyChannels ?? normalizeChecklistNotificationChannels(existingTargetScope);
  const nextRun = isActive && recurrenceType !== "none"
    ? calculateNextRunAt(recurrenceType as RecurrenceType, null, customDays).toISOString()
    : null;
  const { data: savedTemplateId, error: saveError } = await supabase.rpc("save_checklist_template_transaction", {
    p_organization_id: organizationId,
    p_template_id: templateId,
    p_created_by: createdBy,
    p_name: name,
    p_checklist_type: checklistType,
    p_branch_id: branchId,
    p_shift: shift,
    p_department: department,
    p_department_id: departmentId,
    p_repeat_every: repeatEvery,
    p_target_scope: {
      locations: locationScopes,
      department_ids: departmentScopes,
      position_ids: positionScopes,
      users: userScopes,
      notify_channels: persistedNotifyChannels,
      checklist_type_other: checklistTypeOther || null,
    },
    p_is_active: isActive,
    p_sections: normalizedSections,
    p_defer_sections: sectionUpdate === "defer",
    p_expected_cycle_submissions: templateId && !onlyTextEdits ? responsesInCycle : null,
    p_recurrence_type: recurrenceType,
    p_custom_days: customDays,
    p_next_run_at: nextRun,
  });
  if (saveError || typeof savedTemplateId !== "string") {
    return {
      ok: false,
      message: saveError?.code === "40001"
        ? t("El checklist recibió una respuesta mientras se editaba. Vuelve a intentarlo para aplicar los cambios de forma segura.")
        : `${t("No se pudo crear el checklist")}: ${saveError?.message ?? "error"}`,
    };
  }

  if (sectionUpdate === "defer") {
    return {
      ok: true,
      templateId: savedTemplateId,
      preservedHistory: true,
      totalItems,
      pendingUntil: nextRun ?? undefined,
    };
  }

  return { ok: true, templateId: savedTemplateId, preservedHistory, totalItems };
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

  // Ver checklists.i18n.ts: el español es la clave y el diccionario lo pasa a
  // inglés cuando la organización corresponde.
  const t = createChecklistsTranslator(
    await resolveUserLocale({ organizationId, userId: null }),
  );

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, branch_id")
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!template) {
    return { ok: false, message: t("No se encontró el checklist") };
  }

  const { count: submissionsCount, error: countError } = await supabase
    .from("checklist_submissions")
    .select("id", { head: true, count: "exact" })
    .eq("organization_id", organizationId)
    .eq("template_id", templateId);

  if (countError) {
    return {
      ok: false,
      message: `${t("No se pudo verificar el historial del checklist")}: ${countError.message}`,
    };
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
      return { ok: false, message: `${t("No se pudieron borrar los ítems")}: ${itemsDeleteError.message}` };
    }

    const { error: sectionsDeleteError } = await supabase
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", organizationId)
      .eq("template_id", templateId);

    if (sectionsDeleteError) {
      return {
        ok: false,
        message: `${t("No se pudieron borrar las secciones")}: ${sectionsDeleteError.message}`,
      };
    }
  }

  // El reparto programado se va con la plantilla. Si quedara, el cron seguiria
  // procesandolo todos los dias contra un checklist que ya no existe.
  await supabase
    .from("scheduled_jobs")
    .delete()
    .eq("organization_id", organizationId)
    .eq("job_type", "checklist_generator")
    .eq("target_id", templateId);

  const { error: templateDeleteError } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", templateId);

  if (templateDeleteError) {
    return { ok: false, message: `${t("No se pudo borrar el checklist")}: ${templateDeleteError.message}` };
  }

  return {
    ok: true,
    message:
      submissions > 0
        ? `${t("Checklist eliminado.")} ${t("Se conservan {n} {respuestas} en el historial.")
            .replace("{n}", String(submissions))
            .replace("{respuestas}", t(submissions === 1 ? "respuesta" : "respuestas"))}`
        : t("Checklist eliminado."),
    keptSubmissions: submissions,
  };
}
