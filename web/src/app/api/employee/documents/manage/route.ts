import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isEmployeeLinkedDocument } from "@/shared/lib/document-domain";
import { logAuditEvent } from "@/shared/lib/audit";
import { ensureEmployeeDocumentsRootFolder } from "@/shared/lib/employee-documents-root-folder";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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

async function resolveEmployeeScope(organizationId: string, userId: string): Promise<AccessScope> {
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
    position_ids: [] as string[],
    users: [] as string[],
  };
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
  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Selecciona un archivo" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "El archivo supera 10MB" }, { status: 400 });
  }

  let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  try {
    analysis = await analyzeUploadedFile(file);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archivo inválido" },
      { status: 400 },
    );
  }

  try {
    await assertPlanLimitForStorage(access.tenant.organizationId, file.size);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado") },
      { status: 400 },
    );
  }

  const title = titleInput || file.name;

  const admin = createSupabaseAdminClient();

  let folderId: string | null = null;
  let scope = await resolveEmployeeScope(access.tenant.organizationId, access.userId);
  if (folderIdInput) {
    const { data: folder } = await admin
      .from("document_folders")
      .select("id, created_by, access_scope")
      .eq("organization_id", access.tenant.organizationId)
      .eq("id", folderIdInput)
      .maybeSingle();

    if (!folder) {
      return NextResponse.json({ error: "Carpeta inválida" }, { status: 400 });
    }
    if (folder.created_by !== access.userId) {
      return NextResponse.json({ error: "Solo puedes subir archivos a carpetas creadas por ti" }, { status: 403 });
    }

    folderId = folder.id;
    scope = normalizeAccessScope(folder.access_scope, scope);
  } else {
    const root = await ensureEmployeeDocumentsRootFolder({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
    });
    folderId = root.folderId;
  }

  await ensureBucketExists();
  const path = `${access.tenant.organizationId}/employee-owned/${access.userId}/${Date.now()}-${analysis.safeName}`;
  if (!isSafeTenantStoragePath(path, access.tenant.organizationId)) {
    return NextResponse.json({ error: "Ruta invalida" }, { status: 400 });
  }

  const { error: uploadError } = await admin.storage.from(BUCKET_NAME).upload(path, file, {
    contentType: analysis.normalizedMime,
    upsert: false,
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
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
      file_size_bytes: file.size,
      access_scope: scope,
      folder_id: folderId,
    })
    .select("id")
    .single();

  if (insertError || !createdDoc) {
    await admin.storage.from(BUCKET_NAME).remove([path]);
    return NextResponse.json({ error: insertError?.message ?? "No se pudo registrar" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Documento de legajo de empleado no editable" }, { status: 403 });
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
    .select("id, owner_user_id")
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
    return NextResponse.json({ error: "Documento de legajo de empleado no eliminable" }, { status: 403 });
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
    metadata: {},
  });

  return NextResponse.json({ ok: true });
}
