import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

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
import {
  deleteChecklistTemplate,
  upsertChecklistTemplate,
} from "@/modules/checklists/services/checklist-template.service";
import { sendChecklistAudiencePush } from "@/modules/checklists/services/checklist-audience.service";
import { nombreDelActor } from "@/shared/lib/actor-names";
import {
  flattenChecklistSectionTexts,
  parseChecklistSections,
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
  // El respaldo se arma en el mismo formato que `sections`.
  const sectionsToPersist: ChecklistSection[] =
    sections.length > 0 ? sections : [{ name: "General", items: items.map((text) => ({ id: null, text })) }];
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
  const allowedLocations = await resolveEmployeeAllowedLocationIds(
    access.tenant.organizationId,
    access.userId,
  );

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

  // A partir de aca manda el servicio compartido: la persistencia, el reparto
  // programado y el diferido de items son identicos a los del panel de admin.
  // Lo de arriba es lo propio del rol: sus locaciones, sus usuarios, su permiso.
  const result = await upsertChecklistTemplate({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    createdBy: access.userId,
    templateId: null,
    name,
    checklistType,
    checklistTypeOther: undefined,
    branchId: null,
    shift,
    departmentId: null,
    department: null,
    repeatEvery,
    recurrenceType,
    customDays,
    templateStatus: isActive ? "active" : "draft",
    locationScopes: locationPolicy.locations,
    departmentScopes: departmentScope,
    positionScopes: positionScope,
    userScopes: userScope,
    normalizedSections: sectionsToPersist,
    notifyChannels: [],
    scopeMode,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  // El push y la campanita son el canal siempre activo, igual que en el panel de
  // admin. Antes esta ruta no notificaba nada: el checklist aparecia en el portal
  // y nadie se enteraba.
  await sendChecklistAudiencePush({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    templateId: result.templateId,
    origen: "alta",
    templateName: name,
    event: "created",
    itemsCount: result.totalItems,
    actorName: await nombreDelActor(access.tenant.organizationId, access.userId),
    excludeUserId: access.userId,
    targetScope: {
      locations: locationPolicy.locations,
      department_ids: departmentScope,
      position_ids: positionScope,
      users: userScope,
    },
    templateBranchId: null,
  });

  await logAuditEvent({
    action: "employee.checklist.template.create",
    entityType: "checklist_template",
    entityId: result.templateId,
    organizationId: access.tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "low",
    actorId: access.userId,
    metadata: { items_count: items.length },
  });

  revalidatePath("/portal/checklist");
  revalidatePath("/app/checklists");

  return NextResponse.json({ ok: true, templateId: result.templateId });
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
  const sectionsToPersist: ChecklistSection[] =
    sections.length > 0 ? sections : [{ name: "General", items: items.map((text) => ({ id: null, text })) }];
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

  // Igual que en el alta: la regla del rol ya se aplico arriba; el que edita es
  // el servicio compartido, asi que el diferido de items al proximo reparto y la
  // deteccion de renombre valen tambien en el portal de empleado.
  const result = await upsertChecklistTemplate({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    createdBy: access.userId,
    templateId,
    name,
    checklistType,
    checklistTypeOther: undefined,
    branchId: null,
    shift,
    departmentId: null,
    department: null,
    repeatEvery,
    recurrenceType,
    customDays,
    templateStatus: isActive ? "active" : "draft",
    locationScopes: locationPolicy.locations,
    departmentScopes: departmentScope,
    positionScopes: positionScope,
    userScopes: userScope,
    normalizedSections: sectionsToPersist,
    // Publication controls are not exposed in the employee editor. Preserve
    // whatever was selected when the checklist was created.
    notifyChannels: undefined,
    scopeMode,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  await sendChecklistAudiencePush({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    templateId: result.templateId,
    origen: "edicion",
    templateName: name,
    event: "updated",
    itemsCount: result.totalItems,
    actorName: await nombreDelActor(access.tenant.organizationId, access.userId),
    excludeUserId: access.userId,
    targetScope: {
      locations: locationPolicy.locations,
      department_ids: departmentScope,
      position_ids: positionScope,
      users: userScope,
    },
    templateBranchId: null,
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
    metadata: { items_count: items.length, pending_until: result.pendingUntil ?? null },
  });

  revalidatePath("/portal/checklist");
  revalidatePath("/app/checklists");

  return NextResponse.json({
    ok: true,
    // Cuando los items quedaron pendientes, la pantalla tiene que poder decirlo.
    pendingUntil: result.pendingUntil,
  });
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
