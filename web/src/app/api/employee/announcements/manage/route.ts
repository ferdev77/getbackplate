import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { buildAnnouncementAudienceRows } from "@/modules/announcements/lib/scope";
import { logAuditEvent } from "@/shared/lib/audit";

function normalizeKind(kind: string) {
  const value = kind.trim().toLowerCase();
  if (["general", "urgent", "reminder", "celebration"].includes(value)) {
    return value;
  }
  return "general";
}

async function resolveEmployeeDefaultScope(organizationId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { data: employeeRow } = await admin
    .from("employees")
    .select("branch_id, department_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    locations: employeeRow?.branch_id ? [employeeRow.branch_id] : [],
    department_ids: employeeRow?.department_id ? [employeeRow.department_id] : [],
    position_ids: [],
    users: [],
  };
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
      }
    | null;

  const title = String(body?.title ?? "").trim();
  const message = String(body?.body ?? "").trim();
  const kind = normalizeKind(String(body?.kind ?? "general"));
  const expiresAt = String(body?.expires_at ?? "").trim() || null;
  const isFeatured = body?.is_featured === true;

  if (!title || !message) {
    return NextResponse.json({ error: "Titulo y mensaje son obligatorios" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const employeeScope = await resolveEmployeeDefaultScope(access.tenant.organizationId, access.userId);
  const requestedScope = {
    locations: Array.isArray(body?.location_scope) ? body.location_scope.map(String).filter(Boolean) : [],
    department_ids: Array.isArray(body?.department_scope) ? body.department_scope.map(String).filter(Boolean) : [],
    position_ids: Array.isArray(body?.position_scope) ? body.position_scope.map(String).filter(Boolean) : [],
    users: Array.isArray(body?.user_scope) ? body.user_scope.map(String).filter(Boolean) : [],
  };
  const hasRequestedScope =
    requestedScope.locations.length > 0 ||
    requestedScope.department_ids.length > 0 ||
    requestedScope.position_ids.length > 0 ||
    requestedScope.users.length > 0;
  const scope = hasRequestedScope
    ? requestedScope
    : {
        locations: employeeScope.locations,
        department_ids: employeeScope.department_ids,
        position_ids: employeeScope.position_ids,
        users: employeeScope.users,
      };

  const { data: created, error } = await admin
    .from("announcements")
    .insert({
      organization_id: access.tenant.organizationId,
      created_by: access.userId,
      branch_id: null,
      title,
      body: message,
      kind,
      publish_at: new Date().toISOString(),
      target_scope: scope,
      is_featured: isFeatured,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    })
    .select("id")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear aviso" }, { status: 400 });
  }

  const audienceRows = buildAnnouncementAudienceRows(access.tenant.organizationId, created.id, scope);
  await admin.from("announcement_audiences").insert(audienceRows);

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
      }
    | null;

  const announcementId = String(body?.announcementId ?? "").trim();
  const title = String(body?.title ?? "").trim();
  const message = String(body?.body ?? "").trim();
  const kind = normalizeKind(String(body?.kind ?? "general"));
  const expiresAt = String(body?.expires_at ?? "").trim() || null;
  const isFeatured = body?.is_featured === true;

  if (!announcementId || !title || !message) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
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
    return NextResponse.json({ error: "Solo puedes editar avisos creados por ti" }, { status: 403 });
  }

  const employeeScope = await resolveEmployeeDefaultScope(access.tenant.organizationId, access.userId);
  const requestedScope = {
    locations: Array.isArray(body?.location_scope) ? body.location_scope.map(String).filter(Boolean) : [],
    department_ids: Array.isArray(body?.department_scope) ? body.department_scope.map(String).filter(Boolean) : [],
    position_ids: Array.isArray(body?.position_scope) ? body.position_scope.map(String).filter(Boolean) : [],
    users: Array.isArray(body?.user_scope) ? body.user_scope.map(String).filter(Boolean) : [],
  };
  const hasRequestedScope =
    requestedScope.locations.length > 0 ||
    requestedScope.department_ids.length > 0 ||
    requestedScope.position_ids.length > 0 ||
    requestedScope.users.length > 0;
  const scope = hasRequestedScope
    ? requestedScope
    : {
        locations: employeeScope.locations,
        department_ids: employeeScope.department_ids,
        position_ids: employeeScope.position_ids,
        users: employeeScope.users,
      };

  const { error } = await admin
    .from("announcements")
    .update({
      title,
      body: message,
      kind,
      is_featured: isFeatured,
      expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
      target_scope: scope,
    })
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", announcementId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await admin
    .from("announcement_audiences")
    .delete()
    .eq("organization_id", access.tenant.organizationId)
    .eq("announcement_id", announcementId);

  const audienceRows = buildAnnouncementAudienceRows(access.tenant.organizationId, announcementId, scope);
  await admin.from("announcement_audiences").insert(audienceRows);

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

  await admin
    .from("announcement_audiences")
    .delete()
    .eq("organization_id", access.tenant.organizationId)
    .eq("announcement_id", announcementId);

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
