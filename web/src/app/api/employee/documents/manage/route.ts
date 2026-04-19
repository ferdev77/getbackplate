import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isEmployeeLinkedDocument } from "@/shared/lib/document-domain";
import { logAuditEvent } from "@/shared/lib/audit";

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

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const titleInput = String(formData.get("title") ?? "").trim();
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
      { error: error instanceof Error ? error.message : "Archivo invalido" },
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
  const scope = await resolveEmployeeScope(access.tenant.organizationId, access.userId);

  await ensureBucketExists();
  const path = `${access.tenant.organizationId}/employee-owned/${access.userId}/${Date.now()}-${analysis.safeName}`;
  if (!isSafeTenantStoragePath(path, access.tenant.organizationId)) {
    return NextResponse.json({ error: "Ruta invalida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
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
  const access = await assertEmployeeCapabilityApi("documents", "edit", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        documentId?: string;
        title?: string;
      }
    | null;

  const documentId = String(body?.documentId ?? "").trim();
  const title = String(body?.title ?? "").trim();
  if (!documentId || !title) {
    return NextResponse.json({ error: "Documento y titulo son obligatorios" }, { status: 400 });
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
    return NextResponse.json({ error: "Solo puedes editar documentos creados por ti" }, { status: 403 });
  }

  const employeeLinked = await isEmployeeLinkedDocument(admin, access.tenant.organizationId, documentId);
  if (employeeLinked) {
    return NextResponse.json({ error: "Documento de legajo de empleado no editable" }, { status: 403 });
  }

  const { error } = await admin
    .from("documents")
    .update({ title })
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

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const access = await assertEmployeeCapabilityApi("documents", "delete", { allowBillingBypass: true });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await request.json().catch(() => null)) as { documentId?: string } | null;
  const documentId = String(body?.documentId ?? "").trim();
  if (!documentId) {
    return NextResponse.json({ error: "Documento invalido" }, { status: 400 });
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
