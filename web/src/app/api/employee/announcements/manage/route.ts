import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { upsertAnnouncement } from "@/modules/announcements/services/announcement-upsert.service";
import {
  normalizeScopeSelection,
  validateEmployeeUserScopeWithinLocations,
  assertScopeIntent,
  parseScopeIntent,
  validateTenantScopeReferences,
} from "@/shared/lib/scope-validation";
import { enforceLocationPolicy } from "@/shared/lib/scope-policy";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";

function normalizeKind(kind: string) {
  const value = kind.trim().toLowerCase();
  if (["general", "urgent", "reminder", "celebration"].includes(value)) {
    return value;
  }
  return "general";
}


export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("announcements", "create", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        body?: string;
        kind?: string;
        is_featured?: boolean;
        expires_at?: string | null;
        location_scope?: string[];
        department_scope?: string[];
        position_scope?: string[];
        user_scope?: string[];
        scope_mode?: string;
        notify_channels?: string[];
        is_recurring?: boolean;
        recurrence_type?: string;
        custom_days?: string;
      }
    | null;

  const title = String(body?.title ?? "").trim();
  const message = String(body?.body ?? "").trim();
  const kind = normalizeKind(String(body?.kind ?? "general"));
  const expiresAt = String(body?.expires_at ?? "").trim() || null;
  const isFeatured = body?.is_featured === true;
  // El push va siempre, igual que en el panel de admin.
  const notifyChannels = [
    ...new Set([...(Array.isArray(body?.notify_channels) ? body.notify_channels.map(String) : []), "push"]),
  ].filter((channel) => ["sms", "email", "in_app", "push"].includes(channel));
  const isRecurring = body?.is_recurring === true;
  const recurrenceType = String(body?.recurrence_type ?? "daily").trim() || "daily";
  let customDays: number[] = [];
  try {
    const parsed = JSON.parse(String(body?.custom_days ?? "[]"));
    if (Array.isArray(parsed)) customDays = parsed.filter((d): d is number => typeof d === "number");
  } catch {}

  if (!title || !message) {
    return NextResponse.json({ error: "Titulo y mensaje son obligatorios" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const allowedLocations = await resolveEmployeeAllowedLocationIds(access.tenant.organizationId, access.userId);
  const requestedLocations = normalizeScopeSelection(
    Array.isArray(body?.location_scope) ? body.location_scope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedDepartments = normalizeScopeSelection(
    Array.isArray(body?.department_scope) ? body.department_scope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedPositions = normalizeScopeSelection(
    Array.isArray(body?.position_scope) ? body.position_scope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedUsers = normalizeScopeSelection(
    Array.isArray(body?.user_scope) ? body.user_scope.map(String) : [],
    { allowAllToken: true },
  );

  const scopeMode = parseScopeIntent(body?.scope_mode);

  const locationPolicy = enforceLocationPolicy({
    requestedLocations,
    allowedLocations,
    // Con "solo estas personas" no se rellena con las locaciones del
    // empleado: si se rellenara, los filtros alcanzarian a toda su
    // locacion y las personas elegidas solo sumarian encima.
    fallbackToAllowedWhenEmpty: scopeMode !== "people",
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
  }

  const scope = {
    locations: locationPolicy.locations,
    department_ids: requestedDepartments,
    position_ids: requestedPositions,
    users: requestedUsers,
  };

  const intentCheck = assertScopeIntent({
    intent: scopeMode,
    locationIds: requestedLocations,
    departmentIds: requestedDepartments,
    positionIds: requestedPositions,
    userIds: requestedUsers,
  });
  if (!intentCheck.ok) {
    return NextResponse.json({ error: intentCheck.message }, { status: 400 });
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    locationIds: scope.locations,
    departmentIds: scope.department_ids,
    positionIds: scope.position_ids,
    userIds: scope.users,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    return NextResponse.json({ error: "El alcance seleccionado no es válido" }, { status: 400 });
  }

  const userScopePolicy = await validateEmployeeUserScopeWithinLocations({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    userIds: scope.users,
    // Las locaciones habilitadas del empleado, no las que eligio para este
    // item: las personas agregadas a mano son justamente las que estan
    // fuera del grupo elegido. Ademas, con "solo estas personas" las
    // locaciones efectivas quedan vacias y esto rechazaria a todos.
    allowedLocationIds: allowedLocations,
  });

  if (!userScopePolicy.ok) {
    return NextResponse.json({ error: "Solo puedes agregar usuarios de tus locaciones permitidas" }, { status: 400 });
  }

  // De aca en mas manda el servicio compartido: guarda, encola las entregas y
  // arma el reparto periodico. Antes esta ruta solo guardaba, asi que un aviso
  // creado por un empleado no notificaba a nadie.
  const result = await upsertAnnouncement({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    createdBy: access.userId,
    announcementId: null,
    title,
    body: message,
    kind,
    isFeatured,
    expiresAt,
    scope,
    deliveryChannels: notifyChannels,
    recurrence: { isRecurring, recurrenceType, customDays, channels: notifyChannels },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  const created = { id: result.announcementId };

  await logAuditEvent({
    action: "employee.announcement.create",
    entityType: "announcement",
    entityId: created.id,
    organizationId: access.tenant.organizationId,
    eventDomain: "announcements",
    outcome: "success",
    severity: "medium",
    actorId: access.userId,
    metadata: { kind },
  });

  revalidatePath("/portal/announcements");
  revalidatePath("/portal/home");
  revalidatePath("/app/announcements");

  return NextResponse.json({ ok: true, announcementId: created.id });
}

export async function PATCH(request: Request) {
  const access = await assertEmployeeCapabilityApi("announcements", "edit", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        announcementId?: string;
        title?: string;
        body?: string;
        kind?: string;
        is_featured?: boolean;
        expires_at?: string | null;
        location_scope?: string[];
        department_scope?: string[];
        position_scope?: string[];
        user_scope?: string[];
        scope_mode?: string;
        notify_channels?: string[];
        is_recurring?: boolean;
        recurrence_type?: string;
        custom_days?: string;
      }
    | null;

  const announcementId = String(body?.announcementId ?? "").trim();
  const title = String(body?.title ?? "").trim();
  const message = String(body?.body ?? "").trim();
  const kind = normalizeKind(String(body?.kind ?? "general"));
  const expiresAt = String(body?.expires_at ?? "").trim() || null;
  const isFeatured = body?.is_featured === true;
  // El push va siempre, igual que en el panel de admin.
  const notifyChannels = [
    ...new Set([...(Array.isArray(body?.notify_channels) ? body.notify_channels.map(String) : []), "push"]),
  ].filter((channel) => ["sms", "email", "in_app", "push"].includes(channel));
  const isRecurring = body?.is_recurring === true;
  const recurrenceType = String(body?.recurrence_type ?? "daily").trim() || "daily";
  let customDays: number[] = [];
  try {
    const parsed = JSON.parse(String(body?.custom_days ?? "[]"));
    if (Array.isArray(parsed)) customDays = parsed.filter((d): d is number => typeof d === "number");
  } catch {}

  if (!announcementId || !title || !message) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const [{ data: existing }, allowedLocations] = await Promise.all([
    admin
      .from("announcements")
      .select("id, created_by")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", announcementId)
      .maybeSingle(),
    resolveEmployeeAllowedLocationIds(access.tenant.organizationId, access.userId),
  ]);

  if (!existing) {
    return NextResponse.json({ error: "Aviso no encontrado" }, { status: 404 });
  }

  if (existing.created_by !== access.userId) {
    return NextResponse.json({ error: "Solo puedes editar avisos creados por ti" }, { status: 403 });
  }

  const requestedLocations = normalizeScopeSelection(
    Array.isArray(body?.location_scope) ? body.location_scope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedDepartments = normalizeScopeSelection(
    Array.isArray(body?.department_scope) ? body.department_scope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedPositions = normalizeScopeSelection(
    Array.isArray(body?.position_scope) ? body.position_scope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedUsers = normalizeScopeSelection(
    Array.isArray(body?.user_scope) ? body.user_scope.map(String) : [],
    { allowAllToken: true },
  );

  const scopeMode = parseScopeIntent(body?.scope_mode);

  const locationPolicy = enforceLocationPolicy({
    requestedLocations,
    allowedLocations,
    // Con "solo estas personas" no se rellena con las locaciones del
    // empleado: si se rellenara, los filtros alcanzarian a toda su
    // locacion y las personas elegidas solo sumarian encima.
    fallbackToAllowedWhenEmpty: scopeMode !== "people",
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
  }

  const scope = {
    locations: locationPolicy.locations,
    department_ids: requestedDepartments,
    position_ids: requestedPositions,
    users: requestedUsers,
  };

  const intentCheck = assertScopeIntent({
    intent: scopeMode,
    locationIds: requestedLocations,
    departmentIds: requestedDepartments,
    positionIds: requestedPositions,
    userIds: requestedUsers,
  });
  if (!intentCheck.ok) {
    return NextResponse.json({ error: intentCheck.message }, { status: 400 });
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    locationIds: scope.locations,
    departmentIds: scope.department_ids,
    positionIds: scope.position_ids,
    userIds: scope.users,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    return NextResponse.json({ error: "El alcance seleccionado no es válido" }, { status: 400 });
  }

  const userScopePolicy = await validateEmployeeUserScopeWithinLocations({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    userIds: scope.users,
    // Las locaciones habilitadas del empleado, no las que eligio para este
    // item: las personas agregadas a mano son justamente las que estan
    // fuera del grupo elegido. Ademas, con "solo estas personas" las
    // locaciones efectivas quedan vacias y esto rechazaria a todos.
    allowedLocationIds: allowedLocations,
  });

  if (!userScopePolicy.ok) {
    return NextResponse.json({ error: "Solo puedes agregar usuarios de tus locaciones permitidas" }, { status: 400 });
  }

  const result = await upsertAnnouncement({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    createdBy: access.userId,
    announcementId,
    title,
    body: message,
    kind,
    isFeatured,
    expiresAt,
    scope,
    // Al editar no se vuelve a notificar: la notificacion es del momento de
    // publicar, igual que en el panel de admin.
    deliveryChannels: [],
    recurrence: { isRecurring, recurrenceType, customDays, channels: notifyChannels },
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.announcement.update",
    entityType: "announcement",
    entityId: announcementId,
    organizationId: access.tenant.organizationId,
    eventDomain: "announcements",
    outcome: "success",
    severity: "low",
    actorId: access.userId,
    metadata: { kind },
  });

  revalidatePath("/portal/announcements");
  revalidatePath("/portal/home");
  revalidatePath("/app/announcements");

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await assertEmployeeCapabilityApi("announcements", "delete", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { announcementId?: string } | null;
  const announcementId = String(body?.announcementId ?? "").trim();
  if (!announcementId) {
    return NextResponse.json({ error: "Aviso inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("announcements")
    .select("id, created_by")
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", announcementId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Aviso no encontrado" }, { status: 404 });
  }

  if (existing.created_by !== access.userId) {
    return NextResponse.json({ error: "Solo puedes eliminar avisos creados por ti" }, { status: 403 });
  }

  // El reparto periodico se va con el aviso: si quedara, el cron seguiria
  // encolando entregas de algo que ya no existe.
  await admin
    .from("scheduled_jobs")
    .delete()
    .eq("organization_id", access.tenant.organizationId)
    .eq("job_type", "announcement_delivery")
    .eq("target_id", announcementId);

  const { error } = await admin
    .from("announcements")
    .delete()
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", announcementId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.announcement.delete",
    entityType: "announcement",
    entityId: announcementId,
    organizationId: access.tenant.organizationId,
    eventDomain: "announcements",
    outcome: "success",
    severity: "medium",
    actorId: access.userId,
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
