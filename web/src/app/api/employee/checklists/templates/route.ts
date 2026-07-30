import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  normalizeScopeSelection,
  validateEmployeeUserScopeWithinLocations,
  assertScopeIntent,
  parseScopeIntent,
  validateTenantScopeReferences,
} from "@/shared/lib/scope-validation";
import { enforceLocationPolicy } from "@/shared/lib/scope-policy";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";
import { deleteChecklistTemplate, syncChecklistScheduledJob } from "@/modules/checklists/services/checklist-template.service";
import {
  flattenChecklistSectionTexts,
  parseChecklistSections,
  sectionItemLabels,
  type ChecklistSection,
} from "@/modules/checklists/lib/sections";

function parseItems(input: string) {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 80);
}

function normalizeChecklistType(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["opening", "closing", "prep", "custom"].includes(normalized)) return normalized;
  return "custom";
}



export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("checklists", "create", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string;
        items?: string;
        checklist_type?: string;
        shift?: string;
        repeat_every?: string;
        recurrence_type?: string;
        custom_days?: string;
        template_status?: string;
        location_scope?: string[];
        department_scope?: string[];
        position_scope?: string[];
        user_scope?: string[];
        scope_mode?: string;
        sections_payload?: string;
      }
    | null;

  const name = String(body?.name ?? "").trim();
  const fallbackItems = parseItems(String(body?.items ?? ""));
  const sections = parseChecklistSections(body?.sections_payload);
  const items = sections.length > 0 ? flattenChecklistSectionTexts(sections) : fallbackItems;
  const checklistType = normalizeChecklistType(body?.checklist_type);
  const shift = String(body?.shift ?? "1er Shift").trim() || "1er Shift";
  const repeatEvery = String(body?.repeat_every ?? "daily").trim() || "daily";
  const recurrenceType = String(body?.recurrence_type ?? repeatEvery).trim() || "daily";
  let customDays: number[] = [];
  try {
    const parsed = JSON.parse(String(body?.custom_days ?? "[]"));
    if (Array.isArray(parsed)) customDays = parsed.filter((d): d is number => typeof d === "number");
  } catch {}
  const isActive = String(body?.template_status ?? "active").trim() !== "draft";
  const requestedLocationScope = normalizeScopeSelection(
    Array.isArray(body?.location_scope) ? body.location_scope.map(String) : [],
    { allowAllToken: true },
  );
  const departmentScope = normalizeScopeSelection(
    Array.isArray(body?.department_scope) ? body.department_scope.map(String) : [],
    { allowAllToken: true },
  );
  const positionScope = normalizeScopeSelection(
    Array.isArray(body?.position_scope) ? body.position_scope.map(String) : [],
    { allowAllToken: true },
  );
  const userScope = normalizeScopeSelection(
    Array.isArray(body?.user_scope) ? body.user_scope.map(String) : [],
    { allowAllToken: true },
  );

  if (!name || items.length === 0) {
    return NextResponse.json({ error: "Nombre e items son obligatorios" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [allowedLocations, { data: empRow }] = await Promise.all([
    resolveEmployeeAllowedLocationIds(access.tenant.organizationId, access.userId),
    admin
      .from("employees")
      .select("branch_id")
      .eq("organization_id", access.tenant.organizationId)
      .eq("user_id", access.userId)
      .maybeSingle(),
  ]);
  const primaryBranchId = empRow?.branch_id ?? null;

  const scopeMode = parseScopeIntent(body?.scope_mode);

  const locationPolicy = enforceLocationPolicy({
    requestedLocations: requestedLocationScope,
    allowedLocations,
    // Con "solo estas personas" no se rellena con las locaciones del
    // empleado: si se rellenara, los filtros alcanzarian a toda su
    // locacion y las personas elegidas solo sumarian encima.
    fallbackToAllowedWhenEmpty: scopeMode !== "people",
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
  }

  const intentCheck = assertScopeIntent({
    intent: scopeMode,
    locationIds: requestedLocationScope,
    departmentIds: departmentScope,
    positionIds: positionScope,
    userIds: userScope,
  });
  if (!intentCheck.ok) {
    return NextResponse.json({ error: intentCheck.message }, { status: 400 });
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    locationIds: locationPolicy.locations,
    departmentIds: departmentScope,
    positionIds: positionScope,
    userIds: userScope,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    return NextResponse.json({ error: "El alcance seleccionado no es válido" }, { status: 400 });
  }

  const userScopePolicy = await validateEmployeeUserScopeWithinLocations({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    userIds: userScope,
    // Las locaciones habilitadas del empleado, no las que eligio para este
    // item: las personas agregadas a mano son justamente las que estan
    // fuera del grupo elegido. Ademas, con "solo estas personas" las
    // locaciones efectivas quedan vacias y esto rechazaria a todos.
    allowedLocationIds: allowedLocations,
  });

  if (!userScopePolicy.ok) {
    return NextResponse.json({ error: "Solo puedes agregar usuarios de tus locaciones permitidas" }, { status: 400 });
  }

  const { data: createdTemplate, error: createTemplateError } = await admin
    .from("checklist_templates")
    .insert({
        organization_id: access.tenant.organizationId,
        branch_id: primaryBranchId,
        department_id: null,
        checklist_type: checklistType,
        shift,
        repeat_every: repeatEvery,
        name,
        is_active: isActive,
        created_by: access.userId,
        target_scope: {
          locations: locationPolicy.locations,
          department_ids: departmentScope,
          position_ids: positionScope,
          users: userScope,
        },
      })
    .select("id")
    .single();

  if (createTemplateError || !createdTemplate) {
    return NextResponse.json({ error: createTemplateError?.message ?? "No se pudo crear checklist" }, { status: 400 });
  }

  // El respaldo se arma en el mismo formato que `sections`: si quedara como
  // texto suelto, el item viajaria como objeto y se guardaria como tal en label.
  const sectionsToPersist: ChecklistSection[] =
    sections.length > 0 ? sections : [{ name: "General", items: items.map((text) => ({ id: null, text })) }];
  for (let sectionIndex = 0; sectionIndex < sectionsToPersist.length; sectionIndex += 1) {
    const currentSection = sectionsToPersist[sectionIndex];
    const { data: section, error: sectionError } = await admin
      .from("checklist_template_sections")
      .insert({
        organization_id: access.tenant.organizationId,
        template_id: createdTemplate.id,
        name: currentSection.name,
        sort_order: sectionIndex + 1,
      })
      .select("id")
      .single();

    if (sectionError || !section) {
      await admin
        .from("checklist_templates")
        .delete()
        .eq("organization_id", access.tenant.organizationId)
        .eq("id", createdTemplate.id);
      return NextResponse.json({ error: sectionError?.message ?? "No se pudo crear sección" }, { status: 400 });
    }

    const rows = sectionItemLabels(currentSection).map((label, itemIndex) => ({
      organization_id: access.tenant.organizationId,
      section_id: section.id,
      label,
      priority: "medium",
      sort_order: itemIndex + 1,
    }));

    const { error: itemError } = await admin.from("checklist_template_items").insert(rows);
    if (itemError) {
      await admin
        .from("checklist_templates")
        .delete()
        .eq("organization_id", access.tenant.organizationId)
        .eq("id", createdTemplate.id);
      return NextResponse.json({ error: itemError.message }, { status: 400 });
    }
  }

  await syncChecklistScheduledJob({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    templateId: createdTemplate.id,
    recurrenceType,
    customDays,
    isActive,
  });

  await logAuditEvent({
    action: "employee.checklist.template.create",
    entityType: "checklist_template",
    entityId: createdTemplate.id,
    organizationId: access.tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
    actorId: access.userId,
    metadata: { items_count: items.length },
  });

  return NextResponse.json({ ok: true, templateId: createdTemplate.id });
}

export async function PATCH(request: Request) {
  const access = await assertEmployeeCapabilityApi("checklists", "edit", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        templateId?: string;
        name?: string;
        items?: string;
        checklist_type?: string;
        shift?: string;
        repeat_every?: string;
        recurrence_type?: string;
        custom_days?: string;
        template_status?: string;
        location_scope?: string[];
        department_scope?: string[];
        position_scope?: string[];
        user_scope?: string[];
        scope_mode?: string;
        sections_payload?: string;
      }
    | null;

  const templateId = String(body?.templateId ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const fallbackItems = parseItems(String(body?.items ?? ""));
  const sections = parseChecklistSections(body?.sections_payload);
  const items = sections.length > 0 ? flattenChecklistSectionTexts(sections) : fallbackItems;
  const checklistType = normalizeChecklistType(body?.checklist_type);
  const shift = String(body?.shift ?? "1er Shift").trim() || "1er Shift";
  const repeatEvery = String(body?.repeat_every ?? "daily").trim() || "daily";
  const recurrenceType = String(body?.recurrence_type ?? repeatEvery).trim() || "daily";
  let customDays: number[] = [];
  try {
    const parsed = JSON.parse(String(body?.custom_days ?? "[]"));
    if (Array.isArray(parsed)) customDays = parsed.filter((d): d is number => typeof d === "number");
  } catch {}
  const isActive = String(body?.template_status ?? "active").trim() !== "draft";
  const requestedLocationScope = normalizeScopeSelection(
    Array.isArray(body?.location_scope) ? body.location_scope.map(String) : [],
    { allowAllToken: true },
  );
  const departmentScope = normalizeScopeSelection(
    Array.isArray(body?.department_scope) ? body.department_scope.map(String) : [],
    { allowAllToken: true },
  );
  const positionScope = normalizeScopeSelection(
    Array.isArray(body?.position_scope) ? body.position_scope.map(String) : [],
    { allowAllToken: true },
  );
  const userScope = normalizeScopeSelection(
    Array.isArray(body?.user_scope) ? body.user_scope.map(String) : [],
    { allowAllToken: true },
  );

  if (!templateId || !name || items.length === 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const allowedLocations = await resolveEmployeeAllowedLocationIds(access.tenant.organizationId, access.userId);

  const scopeMode = parseScopeIntent(body?.scope_mode);

  const locationPolicy = enforceLocationPolicy({
    requestedLocations: requestedLocationScope,
    allowedLocations,
    // Con "solo estas personas" no se rellena con las locaciones del
    // empleado: si se rellenara, los filtros alcanzarian a toda su
    // locacion y las personas elegidas solo sumarian encima.
    fallbackToAllowedWhenEmpty: scopeMode !== "people",
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
  }

  const intentCheck = assertScopeIntent({
    intent: scopeMode,
    locationIds: requestedLocationScope,
    departmentIds: departmentScope,
    positionIds: positionScope,
    userIds: userScope,
  });
  if (!intentCheck.ok) {
    return NextResponse.json({ error: intentCheck.message }, { status: 400 });
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    locationIds: locationPolicy.locations,
    departmentIds: departmentScope,
    positionIds: positionScope,
    userIds: userScope,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    return NextResponse.json({ error: "El alcance seleccionado no es válido" }, { status: 400 });
  }

  const userScopePolicy = await validateEmployeeUserScopeWithinLocations({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    userIds: userScope,
    // Las locaciones habilitadas del empleado, no las que eligio para este
    // item: las personas agregadas a mano son justamente las que estan
    // fuera del grupo elegido. Ademas, con "solo estas personas" las
    // locaciones efectivas quedan vacias y esto rechazaria a todos.
    allowedLocationIds: allowedLocations,
  });

  if (!userScopePolicy.ok) {
    return NextResponse.json({ error: "Solo puedes agregar usuarios de tus locaciones permitidas" }, { status: 400 });
  }
  const { data: existing } = await admin
    .from("checklist_templates")
    .select("id, created_by")
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Checklist no encontrado" }, { status: 404 });
  }
  if (existing.created_by !== access.userId) {
    return NextResponse.json({ error: "Solo puedes editar checklists creados por ti" }, { status: 403 });
  }

  const { error: updateError } = await admin
    .from("checklist_templates")
    .update({
      name,
      checklist_type: checklistType,
      shift,
      repeat_every: repeatEvery,
      is_active: isActive,
      target_scope: {
        locations: locationPolicy.locations,
        department_ids: departmentScope,
        position_ids: positionScope,
        users: userScope,
      },
    })
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", templateId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const { data: existingSections } = await admin
    .from("checklist_template_sections")
    .select("id")
    .eq("organization_id", access.tenant.organizationId)
    .eq("template_id", templateId);

  const sectionIds = (existingSections ?? []).map((row) => row.id);
  if (sectionIds.length > 0) {
    // Si un borrado falla y se sigue igual, los items viejos quedan mezclados
    // con los nuevos y el checklist termina con el doble.
    const { error: itemsDeleteError } = await admin
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", access.tenant.organizationId)
      .in("section_id", sectionIds);
    if (itemsDeleteError) {
      return NextResponse.json({ error: itemsDeleteError.message }, { status: 400 });
    }

    const { error: sectionsDeleteError } = await admin
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", access.tenant.organizationId)
      .eq("template_id", templateId);
    if (sectionsDeleteError) {
      return NextResponse.json({ error: sectionsDeleteError.message }, { status: 400 });
    }
  }

  // El respaldo se arma en el mismo formato que `sections`: si quedara como
  // texto suelto, el item viajaria como objeto y se guardaria como tal en label.
  const sectionsToPersist: ChecklistSection[] =
    sections.length > 0 ? sections : [{ name: "General", items: items.map((text) => ({ id: null, text })) }];
  for (let sectionIndex = 0; sectionIndex < sectionsToPersist.length; sectionIndex += 1) {
    const currentSection = sectionsToPersist[sectionIndex];
    const { data: section } = await admin
      .from("checklist_template_sections")
      .insert({
        organization_id: access.tenant.organizationId,
        template_id: templateId,
        name: currentSection.name,
        sort_order: sectionIndex + 1,
      })
      .select("id")
      .single();

    if (!section?.id) {
      return NextResponse.json({ error: "No se pudieron actualizar las secciones" }, { status: 400 });
    }

    const rows = sectionItemLabels(currentSection).map((label, itemIndex) => ({
      organization_id: access.tenant.organizationId,
      section_id: section.id,
      label,
      priority: "medium",
      sort_order: itemIndex + 1,
    }));
    const { error: itemsError } = await admin.from("checklist_template_items").insert(rows);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }
  }

  // El reparto programado va por el mismo camino que el del panel de admin.
  await syncChecklistScheduledJob({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    templateId,
    recurrenceType,
    customDays,
    isActive,
  });

  await logAuditEvent({
    action: "employee.checklist.template.update",
    entityType: "checklist_template",
    entityId: templateId,
    organizationId: access.tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "low",
    actorId: access.userId,
    metadata: { items_count: items.length },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await assertEmployeeCapabilityApi("checklists", "delete", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { templateId?: string } | null;
  const templateId = String(body?.templateId ?? "").trim();
  if (!templateId) {
    return NextResponse.json({ error: "Checklist inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("checklist_templates")
    .select("id, created_by")
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", templateId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Checklist no encontrado" }, { status: 404 });
  }
  if (existing.created_by !== access.userId) {
    return NextResponse.json({ error: "Solo puedes eliminar checklists creados por ti" }, { status: 403 });
  }

  // Mismo camino que el panel de admin: borra de verdad y el historial queda,
  // porque cada respuesta guarda su nombre y sus textos.
  const result = await deleteChecklistTemplate({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    templateId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.checklist.template.delete",
    entityType: "checklist_template",
    entityId: templateId,
    organizationId: access.tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "critical",
    actorId: access.userId,
    metadata: { kept_submissions: result.keptSubmissions },
  });

  return NextResponse.json({ ok: true, message: result.message });
}
