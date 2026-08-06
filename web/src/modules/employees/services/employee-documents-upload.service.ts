import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS } from "@/modules/employees/lib/document-slots";
import { DOCUMENTS_BUCKET, ensureDocumentsBucket, readUploadedFile, removeUploadedFile } from "@/shared/lib/direct-upload";
import { employeesStorageLimitForSlot } from "@/shared/lib/employees-messages";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

/**
 * Documentos del expediente que llegan con el formulario de alta/edicion.
 *
 * Existe porque el alta desde el portal (delegacion de RRHH) nunca proceso los
 * archivos del formulario: se parseaban y se descartaban, y el alta respondia
 * "creado" igual. Este servicio concentra lo que hay que hacer con ellos para
 * que no vuelva a haber dos altas con criterios distintos.
 *
 * El alta del panel de empresa (app/api/company/employees/_handlers/post.ts)
 * todavia tiene su propia copia de esta logica, con rollback completo del
 * empleado. No se migro para no tocar un flujo de produccion que funciona.
 */

const ASYNC_POST_PROCESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

export type EmployeeDocumentUpload = {
  slotKey: string;
  slotLabel: string;
  file: File;
  analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
};

export type ReadEmployeeDocumentUploadsResult =
  | { ok: true; uploads: EmployeeDocumentUpload[]; stagingPaths: string[] }
  | { ok: false; message: string; stagingPaths: string[] };

/**
 * Saca los archivos del formulario, vengan por subida directa (una ruta en la
 * carpeta de paso) o dentro del propio formulario. Devuelve tambien las rutas
 * de paso para que quien llame las borre cuando termine.
 */
export async function readEmployeeDocumentUploads(input: {
  formData: FormData;
  organizationId: string;
}): Promise<ReadEmployeeDocumentUploadsResult> {
  const { formData, organizationId } = input;
  const admin = createSupabaseAdminClient();

  const uploads: EmployeeDocumentUpload[] = [];
  const stagingPaths: string[] = [];

  const resolveFile = async (
    pathField: string,
    nameField: string,
    fileField: string,
  ): Promise<{ ok: true; file: File | null } | { ok: false; message: string }> => {
    const stagedPath = String(formData.get(pathField) ?? "").trim();

    if (stagedPath) {
      if (!isSafeTenantStoragePath(stagedPath, organizationId)) {
        return { ok: false, message: "ruta de archivo invalida" };
      }

      const stored = await readUploadedFile(admin, stagedPath, String(formData.get(nameField) ?? "").trim());
      if (!stored.ok) {
        return { ok: false, message: stored.message };
      }

      stagingPaths.push(stagedPath);
      return { ok: true, file: stored.file };
    }

    const raw = formData.get(fileField);
    return { ok: true, file: raw instanceof File && raw.size > 0 ? raw : null };
  };

  for (const definition of EMPLOYEE_DOCUMENT_SLOT_DEFINITIONS) {
    const slotKey = definition.slot;
    const resolved = await resolveFile(
      `document_file_${slotKey}__path`,
      `document_file_${slotKey}__name`,
      `document_file_${slotKey}`,
    );

    if (!resolved.ok) {
      return { ok: false, message: `${definition.label}: ${resolved.message}`, stagingPaths };
    }
    if (!resolved.file) continue;

    try {
      uploads.push({
        slotKey,
        slotLabel: definition.label,
        file: resolved.file,
        analysis: await analyzeUploadedFile(resolved.file),
      });
    } catch (error) {
      return {
        ok: false,
        message: `${definition.label}: ${error instanceof Error ? error.message : "archivo invalido"}`,
        stagingPaths,
      };
    }
  }

  // Los adicionales se casan por posicion con custom_document_title.
  const customTitles = formData.getAll("custom_document_title").map((value) => String(value ?? "").trim());
  const customFiles = formData.getAll("custom_document_file");
  const customPaths = formData.getAll("custom_document_path").map((value) => String(value ?? "").trim());
  const customNames = formData.getAll("custom_document_name").map((value) => String(value ?? "").trim());
  const customCount = Math.max(customFiles.length, customPaths.length);

  for (let index = 0; index < customCount; index += 1) {
    const slotLabel = customTitles[index] || `Documento Adicional ${index + 1}`;
    const stagedPath = customPaths[index] ?? "";

    let file: File | null = null;

    if (stagedPath) {
      if (!isSafeTenantStoragePath(stagedPath, organizationId)) {
        return { ok: false, message: `${slotLabel}: ruta de archivo invalida`, stagingPaths };
      }

      const stored = await readUploadedFile(admin, stagedPath, customNames[index] ?? "");
      if (!stored.ok) {
        return { ok: false, message: `${slotLabel}: ${stored.message}`, stagingPaths };
      }

      stagingPaths.push(stagedPath);
      file = stored.file;
    } else {
      const raw = customFiles[index];
      if (raw instanceof File && raw.size > 0) file = raw;
    }

    if (!file) continue;

    try {
      uploads.push({
        slotKey: `custom_${index + 1}`,
        slotLabel,
        file,
        analysis: await analyzeUploadedFile(file),
      });
    } catch (error) {
      return {
        ok: false,
        message: `${slotLabel}: ${error instanceof Error ? error.message : "archivo invalido"}`,
        stagingPaths,
      };
    }
  }

  return { ok: true, uploads, stagingPaths };
}

export async function removeStagedEmployeeUploads(stagingPaths: string[]) {
  if (stagingPaths.length === 0) return;

  const admin = createSupabaseAdminClient();
  for (const path of stagingPaths) {
    await removeUploadedFile(admin, path);
  }
}

export type AttachEmployeeDocumentUploadsResult =
  | { ok: true; documentIds: string[]; paths: string[] }
  | { ok: false; message: string; documentIds: string[]; paths: string[] };

/**
 * Deja los archivos en su ruta definitiva, los registra en documents y los
 * vincula al expediente. Si algo falla devuelve lo que alcanzo a crear para que
 * quien llame decida si revierte solo esto o el alta entera.
 *
 * Reusa el archivo ya subido cuando el checksum coincide con uno existente, que
 * es lo mismo que hace el alta del panel de empresa.
 */
export async function attachEmployeeDocumentUploads(input: {
  organizationId: string;
  employeeId: string;
  actorId: string;
  branchId: string | null;
  locationScopeIds: string[];
  departmentId: string | null;
  linkedUserId: string | null;
  firstName: string;
  lastName: string;
  uploads: EmployeeDocumentUpload[];
}): Promise<AttachEmployeeDocumentUploadsResult> {
  const documentIds: string[] = [];
  const paths: string[] = [];

  if (input.uploads.length === 0) {
    return { ok: true, documentIds, paths };
  }

  const admin = createSupabaseAdminClient();
  await ensureDocumentsBucket(admin);

  for (const upload of input.uploads) {
    const { data: existingDuplicate } = await admin
      .from("documents")
      .select("id, file_path, mime_type")
      .is("deleted_at", null)
      .eq("organization_id", input.organizationId)
      .eq("checksum_sha256", upload.analysis.checksumSha256)
      .eq("file_size_bytes", upload.file.size)
      .limit(1)
      .maybeSingle();

    const path =
      existingDuplicate?.file_path ||
      `${input.organizationId}/employees/${input.employeeId}/${Date.now()}-${upload.slotKey}-${upload.analysis.safeName}`;

    if (!isSafeTenantStoragePath(path, input.organizationId)) {
      return { ok: false, message: `Ruta invalida para ${upload.slotLabel}`, documentIds, paths };
    }

    try {
      await assertPlanLimitForStorage(input.organizationId, upload.file.size);
    } catch (error) {
      return {
        ok: false,
        message: getPlanLimitErrorMessage(error, employeesStorageLimitForSlot(upload.slotLabel)),
        documentIds,
        paths,
      };
    }

    if (!existingDuplicate) {
      const { error: uploadError } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, upload.file, {
        contentType: upload.analysis.normalizedMime,
        upsert: false,
      });

      if (uploadError) {
        return {
          ok: false,
          message: `No se pudo subir ${upload.slotLabel}: ${uploadError.message}`,
          documentIds,
          paths,
        };
      }

      paths.push(path);
    }

    const { data: createdDoc, error: createDocError } = await admin
      .from("documents")
      .insert({
        organization_id: input.organizationId,
        branch_id: input.branchId,
        owner_user_id: input.actorId,
        title: `${upload.slotLabel} - ${input.firstName} ${input.lastName}`,
        file_path: path,
        mime_type: existingDuplicate?.mime_type || upload.analysis.normalizedMime,
        original_file_name: upload.analysis.originalName,
        checksum_sha256: upload.analysis.checksumSha256,
        file_size_bytes: upload.file.size,
        access_scope: {
          locations: input.locationScopeIds,
          department_ids: input.departmentId ? [input.departmentId] : [],
          users: input.linkedUserId ? [input.linkedUserId] : [],
          internal_only: true,
        },
      })
      .select("id")
      .single();

    if (createDocError || !createdDoc) {
      return {
        ok: false,
        message: `No se pudo registrar ${upload.slotLabel}: ${createDocError?.message ?? "error"}`,
        documentIds,
        paths,
      };
    }

    documentIds.push(createdDoc.id);

    if (upload.file.size >= ASYNC_POST_PROCESS_THRESHOLD_BYTES) {
      await admin.from("document_processing_jobs").insert({
        organization_id: input.organizationId,
        document_id: createdDoc.id,
        job_type: "post_upload",
        status: "pending",
        payload: {
          source: "employees.portal.modal",
          slot: upload.slotKey,
          checksum: upload.analysis.checksumSha256,
          mime: upload.analysis.normalizedMime,
        },
      });
    }
  }

  const reviewedAt = new Date().toISOString();
  const { error: linkError } = await admin.from("employee_documents").insert(
    documentIds.map((documentId) => ({
      organization_id: input.organizationId,
      employee_id: input.employeeId,
      document_id: documentId,
      status: "approved",
      requested_without_file: false,
      pending_since_at: null,
      pending_reminder_stage: 0,
      pending_reminder_last_sent_at: null,
      reviewed_by: input.actorId,
      reviewed_at: reviewedAt,
    })),
  );

  if (linkError) {
    return {
      ok: false,
      message: `No se pudieron vincular los documentos: ${linkError.message}`,
      documentIds,
      paths,
    };
  }

  return { ok: true, documentIds, paths };
}

/**
 * Sube un archivo suelto a un slot del expediente y lo registra en documents.
 *
 * Es la pieza de la subida instantanea: la pantalla de empleados manda un
 * archivo por vez mientras el formulario sigue abierto. Vincularlo al slot
 * (reemplazando el anterior si lo habia) queda del lado de quien llama, porque
 * el estado inicial cambia segun quien sube.
 */
export async function createEmployeeSlotDocument(input: {
  organizationId: string;
  employeeId: string;
  actorId: string;
  slot: string;
  slotLabel: string;
  branchId: string | null;
  departmentId: string | null;
  employeeUserId: string | null;
  fullName: string;
  file: File;
  analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  /** Ruta ya ocupada por el archivo cuando vino por subida directa. */
  storagePath?: string | null;
}): Promise<{ ok: true; documentId: string; title: string; path: string } | { ok: false; message: string }> {
  const admin = createSupabaseAdminClient();
  await ensureDocumentsBucket(admin);

  const safeName = input.analysis.safeName || "archivo";
  const path =
    input.storagePath ||
    `${input.organizationId}/employees/${input.employeeId}/company/${input.slot}/${Date.now()}-${safeName}`;

  if (!isSafeTenantStoragePath(path, input.organizationId)) {
    return { ok: false, message: "Ruta de almacenamiento invalida" };
  }

  try {
    await assertPlanLimitForStorage(input.organizationId, input.file.size);
  } catch (error) {
    return {
      ok: false,
      message: getPlanLimitErrorMessage(error, employeesStorageLimitForSlot(input.slotLabel)),
    };
  }

  // Con subida directa los bytes ya estan en su ruta final.
  if (!input.storagePath) {
    const { error: uploadError } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, input.file, {
      contentType: input.analysis.normalizedMime,
      upsert: false,
    });

    if (uploadError) {
      return { ok: false, message: `No se pudo subir documento: ${uploadError.message}` };
    }
  }

  const { data: createdDoc, error: createDocError } = await admin
    .from("documents")
    .insert({
      organization_id: input.organizationId,
      branch_id: input.branchId,
      owner_user_id: input.actorId,
      title: input.slot.startsWith("custom_") ? input.slotLabel : `${input.slotLabel} - ${input.fullName}`,
      file_path: path,
      mime_type: input.analysis.normalizedMime,
      original_file_name: input.analysis.originalName,
      checksum_sha256: input.analysis.checksumSha256,
      file_size_bytes: input.file.size,
      access_scope: {
        locations: input.branchId ? [input.branchId] : [],
        department_ids: input.departmentId ? [input.departmentId] : [],
        users: input.employeeUserId ? [input.employeeUserId] : [],
        internal_only: true,
      },
    })
    .select("id, title")
    .single();

  if (createDocError || !createdDoc?.id) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { ok: false, message: `No se pudo registrar documento: ${createDocError?.message ?? "error"}` };
  }

  return { ok: true, documentId: createdDoc.id, title: createdDoc.title, path };
}

/**
 * Deshace lo que dejo attachEmployeeDocumentUploads sin tocar al empleado. Se
 * usa cuando el alta ya existia (edicion): ahi borrar el empleado seria peor
 * que quedarse sin los documentos nuevos.
 */
export async function rollbackEmployeeDocumentUploads(input: {
  organizationId: string;
  documentIds: string[];
  paths: string[];
}) {
  const admin = createSupabaseAdminClient();

  try {
    if (input.paths.length) {
      await admin.storage.from(DOCUMENTS_BUCKET).remove(input.paths);
    }

    if (input.documentIds.length) {
      await admin
        .from("employee_documents")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("document_id", input.documentIds);

      await admin
        .from("document_processing_jobs")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("document_id", input.documentIds);

      await admin
        .from("documents")
        .delete()
        .eq("organization_id", input.organizationId)
        .in("id", input.documentIds);
    }
  } catch (error) {
    console.error("[rollbackEmployeeDocumentUploads] Rollback failed:", error);
  }
}
