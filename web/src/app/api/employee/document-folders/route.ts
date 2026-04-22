import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { revalidateDocumentsCaches } from "@/modules/documents/revalidate-cache";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { ensureEmployeeDocumentsRootFolder } from "@/shared/lib/employee-documents-root-folder";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  normalizeScopeSelection,
  validateEmployeeUserScopeWithinLocations,
  validateTenantScopeReferences,
} from "@/shared/lib/scope-validation";
import { enforceLocationPolicy } from "@/shared/lib/scope-policy";

async function resolveEmployeeScope(organizationId: string, userId: string) {
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
  const access = await assertEmployeeCapabilityApi("documents", "create", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    parentId?: string | null;
    locationScope?: string[];
    departmentScope?: string[];
    positionScope?: string[];
    userScope?: string[];
  } | null;
  const name = String(body?.name ?? "").trim();
  const incomingParentId = body?.parentId === null ? null : typeof body?.parentId === "string" ? body.parentId.trim() : null;
  const requestedLocations = normalizeScopeSelection(
    Array.isArray(body?.locationScope) ? body.locationScope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedDepartments = normalizeScopeSelection(
    Array.isArray(body?.departmentScope) ? body.departmentScope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedPositions = normalizeScopeSelection(
    Array.isArray(body?.positionScope) ? body.positionScope.map(String) : [],
    { allowAllToken: true },
  );
  const requestedUsers = normalizeScopeSelection(
    Array.isArray(body?.userScope) ? body.userScope.map(String) : [],
    { allowAllToken: true },
  );

  if (!name) {
    return NextResponse.json({ error: "Nombre de carpeta requerido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  let parentId = incomingParentId;
  if (!parentId) {
    const root = await ensureEmployeeDocumentsRootFolder({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
    });
    parentId = root.folderId;
  }

  if (parentId) {
    const { data: parent } = await admin
      .from("document_folders")
      .select("id, created_by")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "Carpeta padre inválida" }, { status: 400 });
    if (parent.created_by !== access.userId) {
      return NextResponse.json({ error: "Solo puedes crear carpetas dentro de tus propias carpetas" }, { status: 403 });
    }
  }

  const scope = await resolveEmployeeScope(access.tenant.organizationId, access.userId);
  const locationPolicy = enforceLocationPolicy({
    requestedLocations,
    allowedLocations: scope.locations,
    fallbackToAllowedWhenEmpty: true,
  });

  if (!locationPolicy.ok) {
    return NextResponse.json({ error: "No puedes seleccionar locaciones fuera de tu alcance" }, { status: 403 });
  }

  const effectiveScope = {
    locations: locationPolicy.locations,
    department_ids: requestedDepartments,
    position_ids: requestedPositions,
    users: requestedUsers,
  };

  const scopeValidation = await validateTenantScopeReferences({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    locationIds: effectiveScope.locations,
    departmentIds: effectiveScope.department_ids,
    positionIds: effectiveScope.position_ids,
    userIds: effectiveScope.users,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    return NextResponse.json({ error: "El alcance seleccionado no es válido" }, { status: 400 });
  }

  const userScopePolicy = await validateEmployeeUserScopeWithinLocations({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    userIds: effectiveScope.users,
    allowedLocationIds: locationPolicy.locations,
  });

  if (!userScopePolicy.ok) {
    return NextResponse.json({ error: "Solo puedes agregar usuarios de tus ubicaciones permitidas" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("document_folders")
    .insert({
      organization_id: access.tenant.organizationId,
      parent_id: parentId,
      name,
      created_by: access.userId,
      access_scope: effectiveScope,
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear carpeta" }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.documents.folder.create",
    entityType: "document_folder",
    entityId: data.id,
    organizationId: access.tenant.organizationId,
    actorId: access.userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: { name, parent_id: parentId },
  });

  revalidateDocumentsCaches();

  return NextResponse.json({ ok: true, folderId: data.id, parentId });
}

export async function PATCH(request: Request) {
  const access = await assertEmployeeCapabilityApi("documents", "create", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { folderId?: string; parentId?: string | null } | null;
  const folderId = String(body?.folderId ?? "").trim();
  const incomingParentId = body?.parentId === null ? null : typeof body?.parentId === "string" ? body.parentId.trim() : undefined;

  if (!folderId || incomingParentId === undefined) {
    return NextResponse.json({ error: "Carpeta inválida" }, { status: 400 });
  }
  if (incomingParentId === folderId) {
    return NextResponse.json({ error: "Una carpeta no puede ser su propio padre" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: folder } = await admin
    .from("document_folders")
    .select("id, created_by")
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", folderId)
    .maybeSingle();

  const root = await ensureEmployeeDocumentsRootFolder({
    organizationId: access.tenant.organizationId,
    userId: access.userId,
  });

  const parentId = incomingParentId === null
    ? (folderId === root.folderId ? null : root.folderId)
    : incomingParentId;

  if (!folder) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
  if (folder.created_by !== access.userId) {
    return NextResponse.json({ error: "Solo puedes mover carpetas creadas por ti" }, { status: 403 });
  }

  if (parentId) {
    const { data: parent } = await admin
      .from("document_folders")
      .select("id, created_by")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) return NextResponse.json({ error: "Carpeta padre inválida" }, { status: 400 });
    if (parent.created_by !== access.userId) {
      return NextResponse.json({ error: "Solo puedes mover carpetas dentro de tus propias carpetas" }, { status: 403 });
    }

    const { data: allFolders } = await admin
      .from("document_folders")
      .select("id, parent_id")
      .eq("organization_id", access.tenant.organizationId)
      .eq("created_by", access.userId);
    const parentMap = new Map((allFolders ?? []).map((row) => [row.id, row.parent_id]));
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === folderId) {
        return NextResponse.json({ error: "No se puede mover una carpeta dentro de su propia jerarquía" }, { status: 400 });
      }
      cursor = parentMap.get(cursor) ?? null;
    }
  }

  const { error } = await admin
    .from("document_folders")
    .update({ parent_id: parentId })
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", folderId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.documents.folder.reorder",
    entityType: "document_folder",
    entityId: folderId,
    organizationId: access.tenant.organizationId,
    actorId: access.userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "low",
    metadata: { parent_id: parentId },
  });

  revalidateDocumentsCaches();

  return NextResponse.json({ ok: true, folderId, parentId });
}
