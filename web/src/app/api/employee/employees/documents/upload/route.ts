import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendPushToUsers } from "@/infrastructure/push/send-to-org";
import { isEmployeeInScope, resolveHrScope } from "@/modules/employees/lib/api-scope";
import { createEmployeeSlotDocument } from "@/modules/employees/services/employee-documents-upload.service";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  DOCUMENTS_BUCKET,
  MAX_UPLOAD_SIZE_LABEL,
  readUploadedFile,
  removeUploadedFile,
} from "@/shared/lib/direct-upload";
import {
  EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS,
  getEmployeeDocumentSlotLabel,
  resolveEmployeeDocumentSlotFromTitle,
  type EmployeeDocumentSlotKey,
} from "@/shared/lib/employee-document-slots";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { resolveUserLocale } from "@/shared/lib/locale";
import { createNotificationsTranslator } from "@/shared/lib/notifications.i18n";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";
import { MAX_UPLOAD_SIZE_BYTES } from "@/shared/lib/upload-limits";

/**
 * Subida instantanea al expediente desde el portal, para el empleado con
 * gestion de RRHH delegada.
 *
 * Existe porque la pantalla de empleados del portal apuntaba al endpoint del
 * panel de empresa, que exige rol company_admin: quien tenia el permiso
 * delegado recibia un 403 al subir un documento. Hace lo mismo que aquella,
 * pero con el gate delegado y respetando el alcance de locaciones de quien sube.
 */
function isValidSlot(value: string) {
  return value.startsWith("custom_") || EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS.some((item) => item.slot === value);
}

export async function POST(request: Request) {
  const access = await assertEmployeeCapabilityApi("employees", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const organizationId = access.tenant.organizationId;
  const actorId = access.userId;

  const formData = await request.formData();
  const employeeId = String(formData.get("employeeId") ?? "").trim();
  const slotRaw = String(formData.get("slot") ?? "").trim();
  const file = formData.get("file");

  if (!employeeId || !isValidSlot(slotRaw)) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const slot = slotRaw;
  const admin = createSupabaseAdminClient();

  // Dos formas de llegar aca: la subida directa manda solo la ruta, el
  // formulario clasico manda el archivo. Ver shared/lib/direct-upload.ts.
  const storagePathInput = String(formData.get("storage_path") ?? "").trim();
  const uploadedNameInput = String(formData.get("original_file_name") ?? "").trim();

  let orphanPath: string | null = null;
  const fail = async (message: string, status: number) => {
    if (orphanPath) await removeUploadedFile(admin, orphanPath);
    return NextResponse.json({ error: message }, { status });
  };

  let sourceFile: File;

  if (storagePathInput) {
    if (!isSafeTenantStoragePath(storagePathInput, organizationId)) {
      return NextResponse.json({ error: "Ruta de almacenamiento invalida" }, { status: 400 });
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

  if (sourceFile.size > MAX_UPLOAD_SIZE_BYTES) {
    return fail(`El archivo supera ${MAX_UPLOAD_SIZE_LABEL}`, 400);
  }

  const { data: employee } = await admin
    .from("employees")
    .select("id, user_id, first_name, last_name, branch_id, department_id, location_scope_ids, all_locations")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee?.id) {
    return fail("Empleado no encontrado", 404);
  }

  const scopeIds = await resolveHrScope(organizationId, actorId);
  if (!isEmployeeInScope(employee, scopeIds)) {
    return fail("No tienes permisos para editar este empleado", 403);
  }

  let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  try {
    analysis = await analyzeUploadedFile(sourceFile);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Archivo invalido", 400);
  }

  const customTitle = formData.get("customTitle");
  const slotLabel = slot.startsWith("custom_")
    ? (typeof customTitle === "string" && customTitle.trim() ? customTitle.trim() : "Documento Adicional")
    : getEmployeeDocumentSlotLabel(slot as EmployeeDocumentSlotKey);
  const fullName = `${employee.first_name ?? ""} ${employee.last_name ?? ""}`.trim() || "Empleado";

  const created = await createEmployeeSlotDocument({
    organizationId,
    employeeId: employee.id,
    actorId,
    slot,
    slotLabel,
    branchId: employee.branch_id,
    departmentId: employee.department_id,
    employeeUserId: employee.user_id,
    fullName,
    file: sourceFile,
    analysis,
    storagePath: orphanPath,
  });

  if (!created.ok) {
    return fail(created.message, 400);
  }

  // Un slot guarda un solo documento: el nuevo reemplaza al anterior y los
  // duplicados que hubieran quedado se descartan.
  const { data: existingLinks } = await admin
    .from("employee_documents")
    .select("id, document_id, linked_document:documents(title)")
    .eq("organization_id", organizationId)
    .eq("employee_id", employee.id);

  const sameSlotLinks = (existingLinks ?? []).filter((row) => {
    if (slot.startsWith("custom_")) {
      return row.document_id === slot.substring(7);
    }
    const linked = Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document;
    return resolveEmployeeDocumentSlotFromTitle(linked?.title) === slot;
  });

  const linkPayload = {
    document_id: created.documentId,
    status: "approved",
    requested_without_file: false,
    pending_since_at: null,
    pending_reminder_stage: 0,
    pending_reminder_last_sent_at: null,
    reviewed_at: new Date().toISOString(),
    reviewed_by: actorId,
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
  };

  const undoDocument = async () => {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([created.path]);
    await admin.from("documents").delete().eq("organization_id", organizationId).eq("id", created.documentId);
  };

  if (sameSlotLinks.length > 0) {
    const primary = sameSlotLinks[0];
    const extraIds = sameSlotLinks.slice(1).map((row) => row.id);

    const { error: updateLinkError } = await admin
      .from("employee_documents")
      .update(linkPayload)
      .eq("organization_id", organizationId)
      .eq("id", primary.id);

    if (updateLinkError) {
      await undoDocument();
      return NextResponse.json({ error: `No se pudo vincular documento: ${updateLinkError.message}` }, { status: 400 });
    }

    if (extraIds.length > 0) {
      await admin.from("employee_documents").delete().eq("organization_id", organizationId).in("id", extraIds);
    }
  } else {
    const { error: linkError } = await admin.from("employee_documents").insert({
      organization_id: organizationId,
      employee_id: employee.id,
      ...linkPayload,
    });

    if (linkError) {
      await undoDocument();
      return NextResponse.json({ error: `No se pudo vincular documento: ${linkError.message}` }, { status: 400 });
    }
  }

  await logAuditEvent({
    action: "employee_document.company_upload",
    entityType: "employee_document",
    entityId: created.documentId,
    organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    actorId,
    metadata: {
      employee_id: employee.id,
      slot,
      source: "employee.portal.employees_modal",
      file_name: analysis.originalName,
      via: "hr_delegation",
    },
  });

  if (employee.user_id) {
    // El aviso se escribe en español y el diccionario lo pasa a inglés cuando
    // la empresa lo lee así. Ver shared/lib/notifications.i18n.ts.
    const t = createNotificationsTranslator(
      await resolveUserLocale({ organizationId, userId: null }),
    );
    void sendPushToUsers(
      [employee.user_id],
      {
        title: t("Nuevo documento en tu expediente"),
        body: t('Se agregó "{documento}" a tu expediente.', { documento: slotLabel }),
        url: "/portal/documents",
      },
      { source: "employee_document_added", sourceId: `${employee.id}:${created.documentId}`, organizationId },
    );
  }

  return NextResponse.json({
    ok: true,
    slot,
    status: "approved",
    documentId: created.documentId,
    documentTitle: created.title,
  });
}
