import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { logAuditEvent } from "@/shared/lib/audit";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ASYNC_POST_PROCESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

async function ensureBucketExists() {
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (bucket) return;

  await admin.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });
}

async function requireContext() {
  const moduleAccess = await assertCompanyManagerModuleApi("documents");
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

  if (folderId) {
    const { data: folder } = await supabase
      .from("document_folders")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", folderId)
      .maybeSingle();
    if (!folder) {
      return NextResponse.json({ error: "Carpeta invalida para esta empresa" }, { status: 400 });
    }
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId: tenant.organizationId,
    locationIds: locationScopes,
    departmentIds: departmentScopes,
    positionIds: positionScopes,
    userIds: userScopes,
    userSource: "employees",
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
      access_scope: {
        locations: locationScopes,
        department_ids: departmentScopes,
        position_ids: positionScopes,
        users: userScopes,
      },
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

  if (!documentId) {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
  }

  if (folderId !== undefined && folderId) {
    const { data: folder } = await supabase
      .from("document_folders")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", folderId)
      .maybeSingle();

    if (!folder) {
      return NextResponse.json({ error: "Carpeta invalida" }, { status: 400 });
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
  if (locationScope || departmentScope || positionScope || userScope) {
    const { data: current } = await supabase
      .from("documents")
      .select("access_scope")
      .eq("organization_id", tenant.organizationId)
      .eq("id", documentId)
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
      metadata: {
        actor_user_id: context.userId,
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
    metadata: {
      actor_user_id: context.userId,
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

  const { error } = await supabase
    .from("documents")
    .delete()
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
      metadata: {
        actor_user_id: context.userId,
        file_path: document.file_path,
        error: error.message,
      },
    });
    return NextResponse.json({ error: `No se pudo eliminar documento: ${error.message}` }, { status: 400 });
  }

  if (
    document.file_path &&
    isSafeTenantStoragePath(document.file_path, tenant.organizationId, { allowLegacySeedPrefix: true })
  ) {
    const admin = createSupabaseAdminClient();
    await admin.storage.from("tenant-documents").remove([document.file_path]);
  }

  await logAuditEvent({
    action: "documents.file.delete",
    entityType: "document",
    entityId: documentId,
    organizationId: tenant.organizationId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: context.userId,
      file_path: document.file_path,
    },
  });

  return NextResponse.json({ ok: true });
}
