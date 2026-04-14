import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";
const MAX_PLACEHOLDER_SIZE_BYTES = 1024 * 1024;

let bucketExistsChecked = false;

async function ensureBucketExists() {
  if (bucketExistsChecked) return;
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (!bucket) {
    await admin.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: `${MAX_PLACEHOLDER_SIZE_BYTES}`,
    });
  }
  bucketExistsChecked = true;
}

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const tenant = moduleAccess.tenant;
  const actorId = moduleAccess.userId;

  const body = await request.json().catch(() => ({}));
  const employeeId = String((body as Record<string, unknown>)?.employeeId ?? "").trim();
  const customTitle = String((body as Record<string, unknown>)?.title ?? "").trim();

  if (!employeeId || !customTitle) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("id, user_id, first_name, last_name, branch_id, department_id")
    .eq("organization_id", tenant.organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee?.id) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }

  await ensureBucketExists();

  const path = `${tenant.organizationId}/employees/${employee.id}/company/request/${Date.now()}-placeholder.txt`;
  if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
    return NextResponse.json({ error: "Ruta de almacenamiento invalida" }, { status: 400 });
  }

  const placeholderText = `Documento solicitado por la empresa: ${customTitle}`;
  const placeholderFile = new Blob([placeholderText], { type: "text/plain;charset=utf-8" });

  const { error: uploadError } = await admin.storage
    .from(BUCKET_NAME)
    .upload(path, placeholderFile, {
      contentType: "text/plain",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: `No se pudo crear solicitud: ${uploadError.message}` }, { status: 400 });
  }

  const { data: createdDoc, error: createDocError } = await admin
    .from("documents")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: employee.branch_id,
      owner_user_id: actorId,
      title: customTitle,
      file_path: path,
      mime_type: "text/plain",
      original_file_name: "solicitud-documento.txt",
      file_size_bytes: placeholderText.length,
      access_scope: {
        locations: employee.branch_id ? [employee.branch_id] : [],
        department_ids: employee.department_id ? [employee.department_id] : [],
        users: employee.user_id ? [employee.user_id] : [],
        internal_only: true,
      },
    })
    .select("id, title")
    .single();

  if (createDocError || !createdDoc?.id) {
    await admin.storage.from(BUCKET_NAME).remove([path]);
    return NextResponse.json({ error: `No se pudo registrar solicitud: ${createDocError?.message ?? "error"}` }, { status: 400 });
  }

  const { error: linkError } = await admin.from("employee_documents").insert({
    organization_id: tenant.organizationId,
    employee_id: employee.id,
    document_id: createdDoc.id,
    status: "pending",
    requested_without_file: true,
    pending_since_at: new Date().toISOString(),
    pending_reminder_stage: 0,
    pending_reminder_last_sent_at: null,
    reviewed_at: null,
    reviewed_by: null,
    review_comment: null,
    expires_at: null,
    reminder_days: null,
    reminder_last_sent_at: null,
    reminder_sent_for_date: null,
    has_no_expiration: false,
    signature_status: null,
    signature_provider: null,
    signature_submission_id: null,
    signature_submitter_slug: null,
    signature_embed_src: null,
    signature_requested_by: null,
    signature_requested_at: null,
    signature_completed_at: null,
    signature_error: null,
    signature_last_webhook_event_id: null,
  });

  if (linkError) {
    await admin.from("documents").delete().eq("organization_id", tenant.organizationId).eq("id", createdDoc.id);
    await admin.storage.from(BUCKET_NAME).remove([path]);
    return NextResponse.json({ error: `No se pudo crear solicitud: ${linkError.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee_document.company_request",
    entityType: "employee_document",
    entityId: createdDoc.id,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: actorId,
      employee_id: employee.id,
      source: "company.employees.modal",
      slot: `custom_${createdDoc.id}`,
      title: customTitle,
    },
  });

  return NextResponse.json({
    ok: true,
    slot: `custom_${createdDoc.id}`,
    status: "pending",
    documentId: createdDoc.id,
    documentTitle: createdDoc.title,
  });
}
