import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertTenantModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS,
  getEmployeeDocumentSlotLabel,
  resolveEmployeeDocumentSlotFromTitle,
  type EmployeeDocumentSlotKey,
} from "@/shared/lib/employee-document-slots";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

let bucketExistsChecked = false;

async function ensureBucketExists() {
  if (bucketExistsChecked) return;
  const admin = createSupabaseAdminClient();
  const { data: bucket } = await admin.storage.getBucket(BUCKET_NAME);
  if (!bucket) {
    await admin.storage.createBucket(BUCKET_NAME, {
      public: false,
      fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
    });
  }
  bucketExistsChecked = true;
}

function isValidSlot(value: string): boolean {
  return value.startsWith("custom_") || EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS.some((item) => item.slot === value);
}

function getSlotLabel(slot: string, customTitle: unknown): string {
  if (slot.startsWith("custom_")) {
    if (typeof customTitle === "string" && customTitle.trim().length > 0) {
      return customTitle.trim();
    }
    return "Documento Adicional";
  }
  return getEmployeeDocumentSlotLabel(slot as EmployeeDocumentSlotKey);
}

export async function POST(request: Request) {
  const moduleAccess = await assertTenantModuleApi("documents", { allowBillingBypass: true });
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  if (moduleAccess.tenant.roleCode !== "employee") {
    return NextResponse.json({ error: "Solo disponible para portal de empleado" }, { status: 403 });
  }

  const formData = await request.formData();
  const slotRaw = String(formData.get("slot") ?? "").trim();
  const customTitle = formData.get("customTitle");
  const file = formData.get("file");

  if (!isValidSlot(slotRaw)) {
    return NextResponse.json({ error: "Slot documental invalido" }, { status: 400 });
  }

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json({ error: "El archivo supera 10MB" }, { status: 400 });
  }

  const slot = slotRaw;
  const tenant = moduleAccess.tenant;
  const userId = moduleAccess.userId;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, branch_id, department_id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!employee?.id) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
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
    await assertPlanLimitForStorage(tenant.organizationId, file.size);
  } catch (error) {
    return NextResponse.json(
      { error: getPlanLimitErrorMessage(error, `Limite de almacenamiento alcanzado para ${getSlotLabel(slot, customTitle)}.`) },
      { status: 400 },
    );
  }

  await ensureBucketExists();

  const safeName = analysis.safeName || "archivo";
  const path = `${tenant.organizationId}/employees/${employee.id}/self/${slot}/${Date.now()}-${safeName}`;
  if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
    return NextResponse.json({ error: "Ruta de almacenamiento invalida" }, { status: 400 });
  }

  const slotLabel = getSlotLabel(slot, customTitle);
  const fullName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Empleado";

  const { data: uploadResult, error: uploadError } = await admin.storage
    .from(BUCKET_NAME)
    .upload(path, file, {
      contentType: analysis.normalizedMime,
      upsert: false,
    });

  if (uploadError || !uploadResult?.path) {
    return NextResponse.json({ error: `No se pudo subir documento: ${uploadError?.message ?? "error"}` }, { status: 400 });
  }

  const { data: createdDoc, error: createDocError } = await admin
    .from("documents")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: employee.branch_id,
      owner_user_id: userId,
      title: slot.startsWith("custom_") ? slotLabel : `${slotLabel} - ${fullName}`,
      file_path: path,
      mime_type: analysis.normalizedMime,
      original_file_name: analysis.originalName,
      checksum_sha256: analysis.checksumSha256,
      file_size_bytes: file.size,
      access_scope: {
        locations: employee.branch_id ? [employee.branch_id] : [],
        department_ids: employee.department_id ? [employee.department_id] : [],
        users: [userId],
        internal_only: true,
      },
    })
    .select("id, title")
    .single();

  if (createDocError || !createdDoc?.id) {
    await admin.storage.from(BUCKET_NAME).remove([path]);
    return NextResponse.json({ error: `No se pudo registrar documento: ${createDocError?.message ?? "error"}` }, { status: 400 });
  }

  const { data: existingLinks } = await admin
    .from("employee_documents")
    .select("id, document_id, linked_document:documents(title)")
    .eq("organization_id", tenant.organizationId)
    .eq("employee_id", employee.id);

  const sameSlotLinks = (existingLinks ?? []).filter((row) => {
    if (slot.startsWith("custom_")) {
      return row.document_id === slot.substring(7);
    }
    const linked = Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document;
    return resolveEmployeeDocumentSlotFromTitle(linked?.title) === slot;
  });

  if (sameSlotLinks.length > 0) {
    const primary = sameSlotLinks[0];
    const extraIds = sameSlotLinks.slice(1).map((row) => row.id);

    const { error: updateLinkError } = await admin
      .from("employee_documents")
      .update({
        document_id: createdDoc.id,
        status: "pending",
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
      })
      .eq("organization_id", tenant.organizationId)
      .eq("id", primary.id);

    if (updateLinkError) {
      await admin.storage.from(BUCKET_NAME).remove([path]);
      await admin.from("documents").delete().eq("organization_id", tenant.organizationId).eq("id", createdDoc.id);
      return NextResponse.json({ error: `No se pudo vincular documento: ${updateLinkError.message}` }, { status: 400 });
    }

    if (extraIds.length > 0) {
      await admin
        .from("employee_documents")
        .delete()
        .eq("organization_id", tenant.organizationId)
        .in("id", extraIds);
    }
  } else {
    const { error: linkError } = await admin.from("employee_documents").insert({
      organization_id: tenant.organizationId,
      employee_id: employee.id,
      document_id: createdDoc.id,
      status: "pending",
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
      await admin.storage.from(BUCKET_NAME).remove([path]);
      await admin.from("documents").delete().eq("organization_id", tenant.organizationId).eq("id", createdDoc.id);
      return NextResponse.json({ error: `No se pudo vincular documento: ${linkError.message}` }, { status: 400 });
    }
  }

  await logAuditEvent({
    action: "employee_document.self_upload",
    entityType: "employee_document",
    entityId: createdDoc.id,
    organizationId: tenant.organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    metadata: {
      actor_user_id: userId,
      employee_id: employee.id,
      slot,
      source: "employee.portal.profile_modal",
      file_name: analysis.originalName,
    },
  });

  return NextResponse.json({
    ok: true,
    slot,
    status: "pending",
    documentId: createdDoc.id,
    documentTitle: createdDoc.title,
  });
}
