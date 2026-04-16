import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { logAuditEvent } from "@/shared/lib/audit";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { getEmployeeDocumentIdSet, isEmployeeLinkedDocument } from "@/shared/lib/document-domain";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ASYNC_POST_PROCESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

type DocumentScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

function parseDocumentScope(scope: unknown): DocumentScope {
  const value = typeof scope === "object" && scope !== null ? (scope as Record<string, unknown>) : {};
  return {
    locations: Array.isArray(value.locations) ? value.locations.filter((item): item is string => typeof item === "string") : [],
    department_ids: Array.isArray(value.department_ids)
      ? value.department_ids.filter((item): item is string => typeof item === "string")
      : [],
    position_ids: Array.isArray(value.position_ids)
      ? value.position_ids.filter((item): item is string => typeof item === "string")
      : [],
    users: Array.isArray(value.users) ? value.users.filter((item): item is string => typeof item === "string") : [],
  };
}

let bucketExistsChecked = false;

async function ensureBucketExists() {
  if (bucketExistsChecked) return;
  
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (bucket) {
    bucketExistsChecked = true;
    return;
  }
  
  await admin.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });
  
  bucketExistsChecked = true;
}

async function requireContext() {
  const moduleAccess = await assertCompanyAdminModuleApi("documents");
  if (!moduleAccess.ok) {
    return {
      error: NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const tenant = moduleAccess.tenant;

  return { supabase, tenant, userId: moduleAccess.userId };
}

export async function GET(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant } = context;
  const url = new URL(request.url);
  const catalog = url.searchParams.get("catalog");

  if (catalog === "create_modals") {
    const [{ data: customBrandingEnabled }, { data: folders }, { data: branches }, { data: departments }, { data: positions }, { data: recentDocuments }, users, employeeDocumentIds] = await Promise.all([
      supabase.rpc("is_module_enabled", { org_id: tenant.organizationId, module_code: "custom_branding" }),
      supabase
        .from("document_folders")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("branches")
        .select("id, name, city")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("organization_departments")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("department_positions")
        .select("id, department_id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("documents")
        .select("id, title, branch_id, created_at")
        .eq("organization_id", tenant.organizationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(80),
      buildScopeUsersCatalog(tenant.organizationId),
      getEmployeeDocumentIdSet(supabase, tenant.organizationId),
    ]);

    const mappedBranches = (branches ?? []).map((branch) => ({
      id: branch.id,
      name: customBrandingEnabled && branch.city ? branch.city : branch.name,
    }));

    return NextResponse.json({
      folders: folders ?? [],
      branches: mappedBranches,
      departments: departments ?? [],
      positions: positions ?? [],
      users,
      recentDocuments: (recentDocuments ?? []).filter((doc) => !employeeDocumentIds.has(doc.id)).slice(0, 12),
    });
  }

  if (catalog !== "share_scopes") {
    return NextResponse.json({ error: "Consulta no soportada" }, { status: 400 });
  }

  const [{ data: employees }, { data: positions }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, user_id, first_name, last_name")
      .eq("organization_id", tenant.organizationId)
      .not("user_id", "is", null)
      .order("first_name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
  ]);

  return NextResponse.json({
    employees: employees ?? [],
    positions: positions ?? [],
  });
}

export async function POST(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant } = context;
  const formData = await request.formData().catch(() => null);

  if (!formData) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const titleInput = String(formData.get("title") ?? "").trim();
  const folderId = String(formData.get("folder_id") ?? "").trim() || null;
  const rawLocationScopes = formData.getAll("location_scope").map(String);
  const rawDepartmentScopes = formData.getAll("department_scope").map(String);
  const rawPositionScopes = formData.getAll("position_scope").map(String);
  const rawUserScopes = formData.getAll("user_scope").map(String);
  const locationScopes = normalizeScopeSelection(rawLocationScopes, { allowAllToken: true });
  const departmentScopes = normalizeScopeSelection(rawDepartmentScopes, { allowAllToken: true });
  const positionScopes = normalizeScopeSelection(rawPositionScopes, { allowAllToken: true });
  const userScopes = normalizeScopeSelection(rawUserScopes, { allowAllToken: true });
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Selecciona un archivo" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "El archivo supera el limite de 10MB" }, { status: 400 });
  }

  let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  try {
    analysis = await analyzeUploadedFile(file);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archivo invalido" },
      { status: 400 },
    );
  }

  await ensureBucketExists();

  let folderScope: DocumentScope | null = null;
  if (folderId) {
    const { data: folder } = await supabase
      .from("document_folders")
      .select("id, access_scope")
      .eq("organization_id", tenant.organizationId)
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) {
      return NextResponse.json({ error: "Carpeta invalida para esta empresa" }, { status: 400 });
    }
    folderScope = parseDocumentScope(folder.access_scope);
  }

  const effectiveScope = folderScope ?? {
    locations: locationScopes,
    department_ids: departmentScopes,
    position_ids: positionScopes,
    users: userScopes,
  };

  const scopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId: tenant.organizationId,
    locationIds: effectiveScope.locations,
    departmentIds: effectiveScope.department_ids,
    positionIds: effectiveScope.position_ids,
    userIds: effectiveScope.users,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    const messageByField = {
      locations: "Hay locaciones invalidas en el alcance",
      departments: "Hay departamentos invalidos en el alcance",
      positions: "Hay puestos invalidos en el alcance",
      users: "Hay usuarios invalidos en el alcance",
    } as const;
    return NextResponse.json({ error: messageByField[scopeValidation.field] }, { status: 400 });
  }

  const { data: existingDuplicate } = await supabase
    .from("documents")
    .select("id, file_path, mime_type")
    .eq("organization_id", tenant.organizationId)
    .eq("checksum_sha256", analysis.checksumSha256)
    .eq("file_size_bytes", file.size)
    .limit(1)
    .maybeSingle();

  const path = existingDuplicate?.file_path ?? `${tenant.organizationId}/${Date.now()}-${analysis.safeName}`;

  if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
    return NextResponse.json({ error: "Ruta de archivo invalida para esta empresa" }, { status: 400 });
  }

  try {
    await assertPlanLimitForStorage(tenant.organizationId, file.size);
  } catch (error) {
    return NextResponse.json(
      {
        error: getPlanLimitErrorMessage(
          error,
          "Limite de almacenamiento alcanzado. Actualiza tu plan para continuar.",
        ),
      },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  if (!existingDuplicate) {
    const { error: uploadError } = await admin.storage.from(BUCKET_NAME).upload(path, file, {
      contentType: analysis.normalizedMime,
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: `No se pudo subir archivo: ${uploadError.message}` }, { status: 400 });
    }
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      organization_id: tenant.organizationId,
      folder_id: folderId,
      owner_user_id: context.userId,
      title: titleInput || file.name,
      file_path: path,
      mime_type: existingDuplicate?.mime_type || analysis.normalizedMime,
      original_file_name: analysis.originalName,
      checksum_sha256: analysis.checksumSha256,
      file_size_bytes: file.size,
      access_scope: effectiveScope,
    })
    .select("id")
    .single();

  if (documentError) {
    if (!existingDuplicate) {
      await admin.storage.from(BUCKET_NAME).remove([path]);
    }
    return NextResponse.json({ error: `No se pudo registrar documento: ${documentError.message}` }, { status: 400 });
  }

  if (file.size >= ASYNC_POST_PROCESS_THRESHOLD_BYTES && document?.id) {
    await supabase.from("document_processing_jobs").insert({
      organization_id: tenant.organizationId,
      document_id: document.id,
      job_type: "post_upload",
      status: "pending",
      payload: {
        source: "documents.upload",
        checksum: analysis.checksumSha256,
        mime: analysis.normalizedMime,
      },
    });
  }

  await logAuditEvent({
    action: "documents.file.upload",
    entityType: "document",
    entityId: document?.id,
    organizationId: tenant.organizationId,
    actorId: context.userId,
    metadata: { title: titleInput || file.name, folderId, size: file.size },
    eventDomain: "documents",
    outcome: "success",
    severity: "high",
  });

  return NextResponse.json({ ok: true, message: "Documento subido" });
}

export async function PATCH(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant } = context;
  const body = (await request.json().catch(() => null)) as
    | {
        documentId?: string;
        title?: string;
        folderId?: string | null;
        locationScope?: string[];
        departmentScope?: string[];
        positionScope?: string[];
        userScope?: string[];
      }
    | null;

  const documentId = String(body?.documentId ?? "").trim();
  const title = typeof body?.title === "string" ? body.title.trim() : null;
  const folderId = typeof body?.folderId === "string" ? body.folderId.trim() : body?.folderId === null ? null : undefined;
  const locationScope = Array.isArray(body?.locationScope)
    ? normalizeScopeSelection(body.locationScope.map((value) => String(value)), { allowAllToken: true })
    : undefined;
  const departmentScope = Array.isArray(body?.departmentScope)
    ? normalizeScopeSelection(body.departmentScope.map((value) => String(value)), { allowAllToken: true })
    : undefined;
  const positionScope = Array.isArray(body?.positionScope)
    ? normalizeScopeSelection(body.positionScope.map((value) => String(value)), { allowAllToken: true })
    : undefined;
  const userScope = Array.isArray(body?.userScope)
    ? normalizeScopeSelection(body.userScope.map((value) => String(value)), { allowAllToken: true })
    : undefined;

  if (!documentId) {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
  }

  const { data: currentDocument } = await supabase
    .from("documents")
    .select("id, folder_id, access_scope")
    .eq("organization_id", tenant.organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (!currentDocument) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(supabase, tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento de empleado: gestionarlo desde el flujo de Empleados" }, { status: 403 });
  }

  let targetFolderScope: DocumentScope | null = null;
  const targetFolderId = folderId === undefined ? currentDocument.folder_id : folderId;

  if (targetFolderId) {
    const { data: folder } = await supabase
      .from("document_folders")
      .select("id, access_scope")
      .eq("organization_id", tenant.organizationId)
      .eq("id", targetFolderId)
      .maybeSingle();

    if (!folder) {
      return NextResponse.json({ error: "Carpeta invalida" }, { status: 400 });
    }

    targetFolderScope = parseDocumentScope(folder.access_scope);
  }

  if (locationScope || departmentScope || positionScope || userScope) {
    const scopeValidation = await validateTenantScopeReferences({
      supabase,
      organizationId: tenant.organizationId,
      locationIds: locationScope,
      departmentIds: departmentScope,
      positionIds: positionScope,
      userIds: userScope,
      userSource: "memberships",
    });
    if (!scopeValidation.ok) {
      const messageByField = {
        locations: "Locaciones invalidas",
        departments: "Departamentos invalidos",
        positions: "Puestos invalidos",
        users: "Usuarios invalidos",
      } as const;
      return NextResponse.json({ error: messageByField[scopeValidation.field] }, { status: 400 });
    }
  }

  const updatePayload: {
    title?: string;
    folder_id?: string | null;
    access_scope?: { locations: string[]; department_ids: string[]; position_ids: string[]; users: string[] };
  } = {};

  if (title !== null && title.length) {
    updatePayload.title = title;
  }
  if (folderId !== undefined) {
    updatePayload.folder_id = folderId;
  }
  if (targetFolderScope) {
    if (locationScope || departmentScope || positionScope || userScope) {
      return NextResponse.json(
        { error: "El documento hereda permisos de su carpeta. Edita la carpeta para cambiar acceso." },
        { status: 400 },
      );
    }
    updatePayload.access_scope = targetFolderScope;
  } else if (locationScope || departmentScope || positionScope || userScope) {
    const existing = parseDocumentScope(currentDocument.access_scope);
    updatePayload.access_scope = {
      locations: locationScope ?? existing.locations,
      department_ids: departmentScope ?? existing.department_ids,
      position_ids: positionScope ?? existing.position_ids,
      users: userScope ?? existing.users,
    };
  }

  if (!Object.keys(updatePayload).length) {
    return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
  }

  const { error } = await supabase
    .from("documents")
    .update(updatePayload)
    .eq("organization_id", tenant.organizationId)
    .eq("id", documentId);

  if (error) {
    await logAuditEvent({
      action: "documents.file.update",
      entityType: "document",
      entityId: documentId,
      organizationId: tenant.organizationId,
      eventDomain: "documents",
      outcome: "error",
      severity: "medium",
      actorId: context.userId,
      metadata: {
        updated_fields: Object.keys(updatePayload),
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo actualizar documento: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "documents.file.update",
    entityType: "document",
    entityId: documentId,
    organizationId: tenant.organizationId,
    eventDomain: "documents",
    outcome: "success",
    severity: "low",
    actorId: context.userId,
    metadata: {
      updated_fields: Object.keys(updatePayload),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const context = await requireContext();
  if ("error" in context) return context.error;

  const { supabase, tenant } = context;
  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();

  if (!documentId) {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
  }

  const { data: document } = await supabase
    .from("documents")
    .select("id, file_path")
    .eq("organization_id", tenant.organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (!document) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(supabase, tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento de empleado: gestionarlo desde el flujo de Empleados" }, { status: 403 });
  }

  const { error } = await supabase
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", tenant.organizationId)
    .eq("id", documentId);

  if (error) {
    await logAuditEvent({
      action: "documents.file.delete",
      entityType: "document",
      entityId: documentId,
      organizationId: tenant.organizationId,
      eventDomain: "documents",
      outcome: "error",
      severity: "high",
      actorId: context.userId,
      metadata: {
        file_path: document.file_path,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo eliminar documento: ${error.message}` }, { status: 400 });
  }

  // Soft delete means we don't delete the physical file from storage right now.
  // The daily Cron job will permanently purge documents older than 30 days.

  await logAuditEvent({
    action: "documents.file.delete",
    entityType: "document",
    entityId: documentId,
    organizationId: tenant.organizationId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    actorId: context.userId,
    metadata: {
      file_path: document.file_path,
    },
  });

  return NextResponse.json({ ok: true });
}
