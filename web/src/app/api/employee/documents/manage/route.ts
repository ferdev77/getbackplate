import { after } from "next/server";
import { sendDocumentAudiencePush } from "@/modules/documents/services/document-audience.service";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { revalidateDocumentsCaches } from "@/modules/documents/revalidate-cache";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import {
  DOCUMENTS_BUCKET,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
  ensureDocumentsBucket,
  readUploadedFile,
  removeUploadedFile,
} from "@/shared/lib/direct-upload";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isEmployeeLinkedDocument } from "@/shared/lib/document-domain";
import { logAuditEvent } from "@/shared/lib/audit";
import { ensureEmployeeDocumentsRootFolder } from "@/shared/lib/employee-documents-root-folder";
import {
  normalizeScopeSelection,
  validateEmployeeUserScopeWithinLocations,
  assertScopeIntent,
  parseScopeIntent,
  validateTenantScopeReferences,
} from "@/shared/lib/scope-validation";
import { enforceLocationPolicy } from "@/shared/lib/scope-policy";
import { resolveEmployeeAllowedLocationIds } from "@/shared/lib/employee-api-scope";

const BUCKET_NAME = DOCUMENTS_BUCKET;
const MAX_FILE_SIZE_BYTES = MAX_UPLOAD_SIZE_BYTES;

async function ensureBucketExists() {
  await ensureDocumentsBucket(createSupabaseAdminClient());
}


type AccessScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

function normalizeAccessScope(value: unknown, fallback: AccessScope): AccessScope {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  return {
    locations: Array.isArray(raw.locations) ? raw.locations.filter((item): item is string => typeof item === "string") : fallback.locations,
    department_ids: Array.isArray(raw.department_ids) ? raw.department_ids.filter((item): item is string => typeof item === "string") : fallback.department_ids,
    position_ids: Array.isArray(raw.position_ids) ? raw.position_ids.filter((item): item is string => typeof item === "string") : fallback.position_ids,
    users: Array.isArray(raw.users) ? raw.users.filter((item): item is string => typeof item === "string") : fallback.users,
  };
}

export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("documents", "create", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const titleInput = String(formData.get("title") ?? "").trim();
  const folderIdInput = String(formData.get("folder_id") ?? "").trim();
  const requestedLocations = normalizeScopeSelection(formData.getAll("location_scope").map(String), { allowAllToken: true });
  const requestedDepartments = normalizeScopeSelection(formData.getAll("department_scope").map(String), { allowAllToken: true });
  const requestedPositions = normalizeScopeSelection(formData.getAll("position_scope").map(String), { allowAllToken: true });
  const requestedUsers = normalizeScopeSelection(formData.getAll("user_scope").map(String), { allowAllToken: true });
  const scopeMode = parseScopeIntent(formData.get("scope_mode"));

  const admin = createSupabaseAdminClient();

  // Dos formas de llegar aca. La normal es la subida directa: el archivo ya
  // esta en storage y solo viaja su ruta, porque el borde corta los cuerpos de
  // mas de 4.5 MB (ver shared/lib/direct-upload.ts). La otra es el formulario
  // clasico con el archivo adentro, que se mantiene por compatibilidad.
  const storagePathInput = String(formData.get("storage_path") ?? "").trim();
  const uploadedNameInput = String(formData.get("original_file_name") ?? "").trim();
  const file = formData.get("file");

  // Solo hay que limpiar el huerfano cuando los bytes ya estaban en storage
  // antes de validarlos: en el camino clasico todavia no se subio nada.
  let orphanPath: string | null = null;
  const fail = async (message: string, status: number) => {
    if (orphanPath) await removeUploadedFile(admin, orphanPath);
    return NextResponse.json({ error: message }, { status });
  };

  let sourceFile: File;

  if (storagePathInput) {
    const expectedPrefix = `${access.tenant.organizationId}/employee-owned/${access.userId}/`;
    if (!isSafeTenantStoragePath(storagePathInput, access.tenant.organizationId) || !storagePathInput.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Ruta invalida" }, { status: 400 });
    }

    const stored = await readUploadedFile(admin, storagePathInput, uploadedNameInput);
    if (!stored.ok) {
      return NextResponse.json({ error: stored.message }, { status: 400 });
    }

    orphanPath = storagePathInput;
    sourceFile = stored.file;
  } else if (file instanceof File && file.size > 0) {
    sourceFile = file;
  } else {
    return NextResponse.json({ error: "Selecciona un archivo" }, { status: 400 });
  }

  if (sourceFile.size > MAX_FILE_SIZE_BYTES) {
    return fail(`El archivo supera ${MAX_UPLOAD_SIZE_LABEL}`, 400);
  }

  let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  try {
    analysis = await analyzeUploadedFile(sourceFile);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Archivo inválido", 400);
  }

  try {
    await assertPlanLimitForStorage(access.tenant.organizationId, sourceFile.size);
  } catch (error) {
    return fail(getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado"), 400);
  }

  const title = titleInput || uploadedNameInput || sourceFile.name;

  let folderId: string | null = null;
  const allowedLocations = await resolveEmployeeAllowedLocationIds(access.tenant.organizationId, access.userId);
  const fallbackScope: AccessScope = { locations: allowedLocations, department_ids: [], position_ids: [], users: [] };
  let scope = fallbackScope;

  const locationPolicy = enforceLocationPolicy({
    requestedLocations,
    allowedLocations,
    // Con "solo estas personas" no se rellena con las locaciones del empleado:
    // si se rellenara, los filtros alcanzarian a toda su locacion y las personas
    // elegidas solo sumarian encima.
    fallbackToAllowedWhenEmpty: scopeMode !== "people",
  });

  if (!locationPolicy.ok) {
    return fail("No puedes seleccionar locaciones fuera de tu alcance", 403);
  }

  const requestedRootScope: AccessScope = {
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
    return fail(intentCheck.message, 400);
  }

  const scopeValidation = await validateTenantScopeReferences({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    locationIds: requestedRootScope.locations,
    departmentIds: requestedRootScope.department_ids,
    positionIds: requestedRootScope.position_ids,
    userIds: requestedRootScope.users,
    userSource: "memberships",
  });

  if (!scopeValidation.ok) {
    return fail("El alcance seleccionado no es válido", 400);
  }

  const userScopePolicy = await validateEmployeeUserScopeWithinLocations({
    supabase: admin,
    organizationId: access.tenant.organizationId,
    userIds: requestedRootScope.users,
    // Las locaciones habilitadas del empleado, no las que eligio para este
    // item: las personas agregadas a mano son justamente las que estan
    // fuera del grupo elegido. Ademas, con "solo estas personas" las
    // locaciones efectivas quedan vacias y esto rechazaria a todos.
    allowedLocationIds: allowedLocations,
  });

  if (!userScopePolicy.ok) {
    return fail("Solo puedes agregar usuarios de tus locaciones permitidas", 400);
  }

  if (folderIdInput) {
    const { data: folder } = await admin
      .from("document_folders")
      .select("id, created_by, access_scope")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", folderIdInput)
      .maybeSingle();

    if (!folder) {
      return fail("Carpeta inválida", 400);
    }
    if (folder.created_by !== access.userId) {
      return fail("Solo puedes subir archivos a carpetas creadas por ti", 403);
    }

    folderId = folder.id;
    scope = normalizeAccessScope(folder.access_scope, scope);
  } else {
    const root = await ensureEmployeeDocumentsRootFolder({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
    });
    folderId = root.folderId;
    scope = requestedRootScope;
  }

  // En la subida directa los bytes ya estan en storage y la ruta se conserva
  // tal cual la firmo /upload-url; solo el camino clasico tiene que subirlos.
  const path = orphanPath ?? `${access.tenant.organizationId}/employee-owned/${access.userId}/${Date.now()}-${analysis.safeName}`;
  if (!isSafeTenantStoragePath(path, access.tenant.organizationId)) {
    return fail("Ruta invalida", 400);
  }

  if (!orphanPath) {
    await ensureBucketExists();
    const { error: uploadError } = await admin.storage.from(BUCKET_NAME).upload(path, sourceFile, {
      contentType: analysis.normalizedMime,
      upsert: false,
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 400 });
    }
  }

  const { data: createdDoc, error: insertError } = await admin
    .from("documents")
    .insert({
      organization_id: access.tenant.organizationId,
      branch_id: access.tenant.branchId,
      owner_user_id: access.userId,
      title,
      file_path: path,
      mime_type: analysis.normalizedMime,
      original_file_name: analysis.originalName,
      checksum_sha256: analysis.checksumSha256,
      file_size_bytes: sourceFile.size,
      access_scope: scope,
      folder_id: folderId,
    })
    .select("id")
    .single();

  if (insertError || !createdDoc) {
    await admin.storage.from(BUCKET_NAME).remove([path]);
    return NextResponse.json({ error: insertError?.message ?? "No se pudo registrar" }, { status: 400 });
  }

  after(async () => {
    await sendDocumentAudiencePush({
      supabase: admin,
      organizationId: access.tenant.organizationId,
      accessScope: scope,
      branchId: access.tenant.branchId,
      actorUserId: access.userId,
      title,
    });
  });

  await logAuditEvent({
    action: "employee.document.create",
    entityType: "document",
    entityId: createdDoc.id,
    organizationId: access.tenant.organizationId,
    actorId: access.userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: { title },
  });

  revalidateDocumentsCaches();

  return NextResponse.json({ ok: true, documentId: createdDoc.id });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        documentId?: string;
        title?: string;
        folderId?: string | null;
      }
    | null;

  const documentId = String(body?.documentId ?? "").trim();
  const title = typeof body?.title === "string" ? String(body.title).trim() : null;
  const incomingFolderId = body?.folderId === null ? null : typeof body?.folderId === "string" ? body.folderId.trim() : undefined;

  const requiredCapability = title !== null ? "edit" : "create";
  const access = await assertEmployeeCapabilityApi("documents", requiredCapability, { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (!documentId || (title === null && incomingFolderId === undefined)) {
    return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("documents")
    .select("id, owner_user_id, folder_id")
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", documentId)
    .maybeSingle();

  const root = await ensureEmployeeDocumentsRootFolder({
    organizationId: access.tenant.organizationId,
    userId: access.userId,
  });

  const folderId = incomingFolderId === null ? root.folderId : incomingFolderId;

  if (!existing) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  if (existing.owner_user_id !== access.userId) {
    return NextResponse.json({ error: "Solo puedes editar documentos creados por ti" }, { status: 403 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(admin, access.tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento del expediente del empleado no editable" }, { status: 403 });
  }

  if (folderId !== undefined && folderId) {
    const { data: targetFolder } = await admin
      .from("document_folders")
      .select("id, created_by")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", folderId)
      .maybeSingle();
    if (!targetFolder) {
      return NextResponse.json({ error: "Carpeta inválida" }, { status: 400 });
    }
    if (targetFolder.created_by !== access.userId) {
      return NextResponse.json({ error: "Solo puedes mover archivos a carpetas creadas por ti" }, { status: 403 });
    }
  }

  const updatePayload: { title?: string; folder_id?: string | null } = {};
  if (title !== null && title.length > 0) updatePayload.title = title;
  if (folderId !== undefined) updatePayload.folder_id = folderId;

  const { error } = await admin
    .from("documents")
    .update(updatePayload)
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", documentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.document.update",
    entityType: "document",
    entityId: documentId,
    organizationId: access.tenant.organizationId,
    actorId: access.userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "low",
    metadata: { title },
  });

  revalidateDocumentsCaches();

  return NextResponse.json({ ok: true, folderId: folderId ?? existing.folder_id ?? null });
}

export async function DELETE(request: Request) {
  const access = await assertEmployeeCapabilityApi("documents", "delete", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();
  if (!documentId) {
    return NextResponse.json({ error: "Documento inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: existing } = await admin
    .from("documents")
    .select("id, title, owner_user_id")
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", documentId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  if (existing.owner_user_id !== access.userId) {
    return NextResponse.json({ error: "Solo puedes eliminar documentos creados por ti" }, { status: 403 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(admin, access.tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento del expediente del empleado no eliminable" }, { status: 403 });
  }

  const { error } = await admin
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("organization_id", access.tenant.organizationId)
    .eq("id", documentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.document.delete",
    entityType: "document",
    entityId: documentId,
    organizationId: access.tenant.organizationId,
    actorId: access.userId,
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
    metadata: { document_title: existing.title },
  });

  revalidateDocumentsCaches();

  return NextResponse.json({ ok: true });
}
