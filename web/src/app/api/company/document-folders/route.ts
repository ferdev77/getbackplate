import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

async function requireContext() {
  const moduleAccess = await assertCompanyManagerModuleApi("documents");
  if (!moduleAccess.ok) {
    return {
      error: NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const tenant = moduleAccess.tenant;
  const userId = moduleAccess.userId;

  return { supabase, tenant, userId };
}

export async function PATCH(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant, userId } = context;
  const body = (await request.json().catch(() => null)) as
    | {
        folderId?: string;
        name?: string;
        parentId?: string | null;
        locationScope?: string[];
        departmentScope?: string[];
        positionScope?: string[];
        userScope?: string[];
      }
    | null;

  const folderId = String(body?.folderId ?? "").trim();
  const name = typeof body?.name === "string" ? body.name.trim() : null;
  const parentId = typeof body?.parentId === "string" ? body.parentId.trim() : body?.parentId === null ? null : undefined;
  const locationScope = Array.isArray(body?.locationScope)
    ? [...new Set(body.locationScope.map((value) => String(value).trim()).filter(Boolean))]
    : undefined;
  const departmentScope = Array.isArray(body?.departmentScope)
    ? [...new Set(body.departmentScope.map((value) => String(value).trim()).filter(Boolean))]
    : undefined;
  const positionScope = Array.isArray(body?.positionScope)
    ? [...new Set(body.positionScope.map((value) => String(value).trim()).filter(Boolean))]
    : undefined;
  const userScope = Array.isArray(body?.userScope)
    ? [...new Set(body.userScope.map((value) => String(value).trim()).filter(Boolean))]
    : undefined;

  if (!folderId) {
    return NextResponse.json({ error: "Carpeta invalida" }, { status: 400 });
  }

  if (parentId !== undefined && parentId === folderId) {
    return NextResponse.json({ error: "Una carpeta no puede ser su propio padre" }, { status: 400 });
  }

  if (parentId !== undefined && parentId) {
    const { data: parent } = await supabase
      .from("document_folders")
      .select("id, parent_id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) {
      return NextResponse.json({ error: "Carpeta padre invalida" }, { status: 400 });
    }

    const { data: allFolders } = await supabase
      .from("document_folders")
      .select("id, parent_id")
      .eq("organization_id", tenant.organizationId);

    const parentMap = new Map((allFolders ?? []).map((row) => [row.id, row.parent_id]));
    let cursor: string | null = parentId;
    while (cursor) {
      if (cursor === folderId) {
        return NextResponse.json({ error: "No se puede mover una carpeta dentro de su propia jerarquia" }, { status: 400 });
      }
      cursor = parentMap.get(cursor) ?? null;
    }
  }

  if (locationScope && locationScope.length) {
    const { data: rows } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .in("id", locationScope);
    if ((rows?.length ?? 0) !== locationScope.length) {
      return NextResponse.json({ error: "Locaciones invalidas" }, { status: 400 });
    }
  }

  if (departmentScope && departmentScope.length) {
    const { data: rows } = await supabase
      .from("organization_departments")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .in("id", departmentScope);
    if ((rows?.length ?? 0) !== departmentScope.length) {
      return NextResponse.json({ error: "Departamentos invalidos" }, { status: 400 });
    }
  }

  if (userScope && userScope.length) {
    const { data: rows } = await supabase
      .from("employees")
      .select("user_id")
      .eq("organization_id", tenant.organizationId)
      .in("user_id", userScope);
    if ((rows?.length ?? 0) !== userScope.length) {
      return NextResponse.json({ error: "Usuarios invalidos" }, { status: 400 });
    }
  }

  if (positionScope && positionScope.length) {
    const { data: rows } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .in("id", positionScope);
    if ((rows?.length ?? 0) !== positionScope.length) {
      return NextResponse.json({ error: "Puestos invalidos" }, { status: 400 });
    }
  }

  const updatePayload: {
    name?: string;
    parent_id?: string | null;
    access_scope?: { locations: string[]; department_ids: string[]; position_ids: string[]; users: string[] };
  } = {};

  if (name !== null && name.length) {
    updatePayload.name = name;
  }
  if (parentId !== undefined) {
    updatePayload.parent_id = parentId;
  }
  if (locationScope || departmentScope || positionScope || userScope) {
    const { data: current } = await supabase
      .from("document_folders")
      .select("access_scope")
      .eq("organization_id", tenant.organizationId)
      .eq("id", folderId)
      .maybeSingle();
    const existing = (current?.access_scope as Record<string, unknown> | null) ?? {};
    const existingLocations = Array.isArray(existing.locations) ? (existing.locations as string[]) : [];
    const existingDepartments = Array.isArray(existing.department_ids) ? (existing.department_ids as string[]) : [];
    const existingPositions = Array.isArray(existing.position_ids) ? (existing.position_ids as string[]) : [];
    const existingUsers = Array.isArray(existing.users) ? (existing.users as string[]) : [];

    updatePayload.access_scope = {
      locations: locationScope ?? existingLocations,
      department_ids: departmentScope ?? existingDepartments,
      position_ids: positionScope ?? existingPositions,
      users: userScope ?? existingUsers,
    };
  }

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
  }

  const { error } = await supabase
    .from("document_folders")
    .update(updatePayload)
    .eq("organization_id", tenant.organizationId)
    .eq("id", folderId);

  if (error) {
    await logAuditEvent({
      action: "document.folder.update",
      entityType: "document_folder",
      entityId: folderId,
      organizationId: tenant.organizationId,
      eventDomain: "documents",
      outcome: "error",
      severity: "medium",
      metadata: {
        actor_user_id: userId,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo actualizar carpeta: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "document.folder.update",
    entityType: "document_folder",
    entityId: folderId,
    organizationId: tenant.organizationId,
    eventDomain: "documents",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: userId,
      updated_fields: Object.keys(updatePayload),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant, userId } = context;
  const body = (await request.json().catch(() => null)) as { folderId?: string } | null;
  const folderId = String(body?.folderId ?? "").trim();

  if (!folderId) {
    return NextResponse.json({ error: "Carpeta invalida" }, { status: 400 });
  }

  const [{ data: childFolders }, { data: childDocs }] = await Promise.all([
    supabase
      .from("document_folders")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("parent_id", folderId)
      .limit(1),
    supabase
      .from("documents")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("folder_id", folderId)
      .limit(1),
  ]);

  if ((childFolders?.length ?? 0) > 0 || (childDocs?.length ?? 0) > 0) {
    return NextResponse.json({ error: "La carpeta tiene contenido. Mueve o elimina primero sus elementos" }, { status: 400 });
  }

  const { error } = await supabase
    .from("document_folders")
    .delete()
    .eq("organization_id", tenant.organizationId)
    .eq("id", folderId);

  if (error) {
    await logAuditEvent({
      action: "document.folder.delete",
      entityType: "document_folder",
      entityId: folderId,
      organizationId: tenant.organizationId,
      eventDomain: "documents",
      outcome: "error",
      severity: "high",
      metadata: {
        actor_user_id: userId,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo eliminar carpeta: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "document.folder.delete",
    entityType: "document_folder",
    entityId: folderId,
    organizationId: tenant.organizationId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: userId,
    },
  });

  return NextResponse.json({ ok: true });
}
