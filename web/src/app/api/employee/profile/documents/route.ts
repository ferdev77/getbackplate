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
import {
  DOCUMENTS_BUCKET,
  MAX_UPLOAD_SIZE_BYTES,
  MAX_UPLOAD_SIZE_LABEL,
  ensureDocumentsBucket,
  readUploadedFile,
  removeUploadedFile,
} from "@/shared/lib/direct-upload";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { companyAdminUserIds } from "@/shared/lib/notification-recipients";
import { createNotificationsTranslator } from "@/shared/lib/notifications.i18n";
import { resolveUserLocale } from "@/shared/lib/locale";

const BUCKET_NAME = DOCUMENTS_BUCKET;
const MAX_FILE_SIZE_BYTES = MAX_UPLOAD_SIZE_BYTES;

async function ensureBucketExists() {
  await ensureDocumentsBucket(createSupabaseAdminClient());
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
    return NextResponse.json({ error: "Slot documental inválido" }, { status: 400 });
  }

  const slot = slotRaw;
  const tenant = moduleAccess.tenant;
  const userId = moduleAccess.userId;

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Dos formas de llegar aca. La normal es la subida directa: el archivo ya
  // esta en storage y solo viaja su ruta, porque el borde corta los cuerpos de
  // mas de 4.5 MB (ver shared/lib/direct-upload.ts). La otra es el formulario
  // clasico con el archivo adentro, que se mantiene por compatibilidad.
  const storagePathInput = String(formData.get("storage_path") ?? "").trim();
  const uploadedNameInput = String(formData.get("original_file_name") ?? "").trim();

  // Solo hay que limpiar el huerfano cuando los bytes ya estaban en storage
  // antes de validarlos: en el camino clasico todavia no se subio nada.
  let orphanPath: string | null = null;
  const fail = async (message: string, status: number) => {
    if (orphanPath) await removeUploadedFile(admin, orphanPath);
    return NextResponse.json({ error: message }, { status });
  };

  let sourceFile: File;

  if (storagePathInput) {
    if (!isSafeTenantStoragePath(storagePathInput, tenant.organizationId)) {
      return NextResponse.json({ error: "Ruta de almacenamiento inválida" }, { status: 400 });
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
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }

  if (sourceFile.size > MAX_FILE_SIZE_BYTES) {
    return fail(`El archivo supera ${MAX_UPLOAD_SIZE_LABEL}`, 400);
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, first_name, last_name, branch_id, department_id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!employee?.id) {
    return fail("Empleado no encontrado", 404);
  }

  let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  try {
    analysis = await analyzeUploadedFile(sourceFile);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Archivo inválido", 400);
  }

  try {
    await assertPlanLimitForStorage(tenant.organizationId, sourceFile.size);
  } catch (error) {
    return fail(
      getPlanLimitErrorMessage(error, `Límite de almacenamiento alcanzado para ${getSlotLabel(slot, customTitle)}.`),
      400,
    );
  }

  await ensureBucketExists();

  const safeName = analysis.safeName || "archivo";
  const path =
    orphanPath ?? `${tenant.organizationId}/employees/${employee.id}/self/${slot}/${Date.now()}-${safeName}`;
  if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
    return fail("Ruta de almacenamiento inválida", 400);
  }

  const slotLabel = getSlotLabel(slot, customTitle);
  const fullName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Empleado";

  // Con subida directa los bytes ya estan en su ruta final: no se vuelven a
  // mandar, solo se registran.
  if (!orphanPath) {
    const { data: uploadResult, error: uploadError } = await admin.storage
      .from(BUCKET_NAME)
      .upload(path, sourceFile, {
        contentType: analysis.normalizedMime,
        upsert: false,
      });

    if (uploadError || !uploadResult?.path) {
      return NextResponse.json({ error: `No se pudo subir documento: ${uploadError?.message ?? "error"}` }, { status: 400 });
    }
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
      file_size_bytes: sourceFile.size,
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
        requested_without_file: false,
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
      requested_without_file: false,
      pending_since_at: new Date().toISOString(),
      pending_reminder_stage: 0,
      pending_reminder_last_sent_at: null,
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
    actorId: userId,
    metadata: {
      employee_id: employee.id,
      slot,
      source: "employee.portal.profile_modal",
      file_name: analysis.originalName,
    },
  });

  const adminUserIds = await companyAdminUserIds(admin, tenant.organizationId);
  if (adminUserIds.length) {
    // El aviso se escribe en español y el diccionario lo pasa a inglés cuando
    // la empresa lo lee así. Ver shared/lib/notifications.i18n.ts.
    const t = createNotificationsTranslator(
      await resolveUserLocale({ organizationId: tenant.organizationId, userId: null }),
    );
    void sendPushToUsers(
      adminUserIds,
      {
        title: t("Hay un documento para revisar"),
        body: t('{persona} subió "{documento}".', { persona: fullName, documento: slotLabel }),
        url: "/app/employees",
      },
      { source: "employee_document_submitted", sourceId: `${employee.id}:${createdDoc.id}`, organizationId: tenant.organizationId },
    );
  }

  return NextResponse.json({
    ok: true,
    slot,
    status: "pending",
    documentId: createdDoc.id,
    documentTitle: createdDoc.title,
  });
}
