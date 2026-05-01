import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  normalizeScopeSelection,
  validateEmployeeUserScopeWithinLocations,
  validateTenantScopeReferences,
} from "@/shared/lib/scope-validation";
import { enforceLocationPolicy } from "@/shared/lib/scope-policy";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";

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

function parseSectionsPayload(raw: string | null | undefined) {
  const value = String(raw ?? "").trim();
  if (!value) return [] as Array<{ name: string; items: string[] }>;
  try {
    const parsed = JSON.parse(value) as Array<{ name?: unknown; items?: unknown }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((section) => ({
        name: typeof section?.name === "string" && section.name.trim() ? section.name.trim() : "General",
        items: Array.isArray(section?.items)
          ? section.items.map((item) => String(item).trim()).filter(Boolean)
          : [],
      }))
      .filter((section) => section.items.length > 0)
      .slice(0, 20);
  } catch {
    return [];
  }
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
        template_status?: string;
        location_scope?: string[];
        department_scope?: string[];
        position_scope?: string[];
        user_scope?: string[];
        sections_payload?: string;
      }
    | null;

  const name = String(body?.name ?? "").trim();
  const fallbackItems = parseItems(String(body?.items ?? ""));
  const sections = parseSectionsPayload(body?.sections_payload);
  const items = sections.length > 0 ? sections.flatMap((section) => section.items) : fallbackItems;
  const checklistType = normalizeChecklistType(body?.checklist_type);
  const shift = String(body?.shift ?? "1er Shift").trim() || "1er Shift";
  const repeatEvery = String(body?.repeat_every ?? "daily").trim() || "daily";
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

  const locationPolicy = enforceLocationPolicy({
    requestedLocations: requestedLocationScope,
    allowedLocations,
    fallbackToAllowedWhenEmpty: true,
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
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
    allowedLocationIds: locationPolicy.locations,
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

  const sectionsToPersist = sections.length > 0 ? sections : [{ name: "General", items }];
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

    const rows = currentSection.items.map((item, itemIndex) => ({
      organization_id: access.tenant.organizationId,
      section_id: section.id,
      label: item,
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
        template_status?: string;
        location_scope?: string[];
        department_scope?: string[];
        position_scope?: string[];
        user_scope?: string[];
        sections_payload?: string;
      }
    | null;

  const templateId = String(body?.templateId ?? "").trim();
  const name = String(body?.name ?? "").trim();
  const fallbackItems = parseItems(String(body?.items ?? ""));
  const sections = parseSectionsPayload(body?.sections_payload);
  const items = sections.length > 0 ? sections.flatMap((section) => section.items) : fallbackItems;
  const checklistType = normalizeChecklistType(body?.checklist_type);
  const shift = String(body?.shift ?? "1er Shift").trim() || "1er Shift";
  const repeatEvery = String(body?.repeat_every ?? "daily").trim() || "daily";
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

  const locationPolicy = enforceLocationPolicy({
    requestedLocations: requestedLocationScope,
    allowedLocations,
    fallbackToAllowedWhenEmpty: true,
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
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
    allowedLocationIds: locationPolicy.locations,
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
    await admin
      .from("checklist_template_items")
      .delete()
      .eq("organization_id", access.tenant.organizationId)
      .in("section_id", sectionIds);
    await admin
      .from("checklist_template_sections")
      .delete()
      .eq("organization_id", access.tenant.organizationId)
      .eq("template_id", templateId);
  }

  const sectionsToPersist = sections.length > 0 ? sections : [{ name: "General", items }];
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

    const rows = currentSection.items.map((item, itemIndex) => ({
      organization_id: access.tenant.organizationId,
      section_id: section.id,
      label: item,
      priority: "medium",
      sort_order: itemIndex + 1,
    }));
    const { error: itemsError } = await admin.from("checklist_template_items").insert(rows);
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 400 });
    }
  }

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

  const { count: submissionsCount } = await admin
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", access.tenant.organizationId)
    .eq("template_id", templateId);

  if ((submissionsCount ?? 0) > 0) {
    const { error: archiveError } = await admin
      .from("checklist_templates")
      .update({ is_active: false })
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", templateId);
    if (archiveError) {
      return NextResponse.json({ error: archiveError.message }, { status: 400 });
    }
  } else {
    const { data: sections } = await admin
      .from("checklist_template_sections")
      .select("id")
      .eq("organization_id", access.tenant.organizationId)
      .eq("template_id", templateId);
    const sectionIds = (sections ?? []).map((row) => row.id);
    if (sectionIds.length > 0) {
      await admin
        .from("checklist_template_items")
        .delete()
        .eq("organization_id", access.tenant.organizationId)
        .in("section_id", sectionIds);
      await admin
        .from("checklist_template_sections")
        .delete()
        .eq("organization_id", access.tenant.organizationId)
        .eq("template_id", templateId);
    }

    const { error: deleteError } = await admin
      .from("checklist_templates")
      .delete()
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", templateId);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }
  }

  await logAuditEvent({
    action: "employee.checklist.template.delete",
    entityType: "checklist_template",
    entityId: templateId,
    organizationId: access.tenant.organizationId,
    eventDomain: "checklists",
    outcome: "success",
    severity: "medium",
    actorId: access.userId,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
