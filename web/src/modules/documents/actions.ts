"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { analyzeUploadedFile } from "@/shared/lib/file-security";
import { logAuditEvent } from "@/shared/lib/audit";
import { requireTenantModule } from "@/shared/lib/access";
import { assertPlanLimitForStorage, getPlanLimitErrorMessage } from "@/shared/lib/plan-limits";
import { normalizeScopeSelection, validateTenantScopeReferences } from "@/shared/lib/scope-validation";
import { isSafeTenantStoragePath } from "@/shared/lib/storage-guardrails";

const BUCKET_NAME = "tenant-documents";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ASYNC_POST_PROCESS_THRESHOLD_BYTES = 5 * 1024 * 1024;

function qs(message: string) {
  return encodeURIComponent(message);
}

async function ensureBucketExists() {
  const supabase = createSupabaseAdminClient();
  const { data: bucket } = await supabase.storage.getBucket(BUCKET_NAME);

  if (bucket) return;

  await supabase.storage.createBucket(BUCKET_NAME, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE_BYTES}`,
  });
}

export async function createDocumentFolderAction(prevState: any, formData: FormData) {
  const tenant = await requireTenantModule("documents");

  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parent_id") ?? "").trim() || null;
  const locationScopes = normalizeScopeSelection(formData.getAll("location_scope").map(String));
  const departmentScopes = normalizeScopeSelection(formData.getAll("department_scope").map(String));
  const positionScopes = normalizeScopeSelection(formData.getAll("position_scope").map(String));
  const userScopes = normalizeScopeSelection(formData.getAll("user_scope").map(String));

  if (!name) {
    return { success: false, message: "Nombre de carpeta requerido" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();

  if (parentId) {
    const { data: parent, error: parentError } = await supabase
      .from("document_folders")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", parentId)
      .maybeSingle();

    if (parentError || !parent) {
      return { success: false, message: "Carpeta padre invalida para esta empresa" };
    }
  }

  const folderScopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId: tenant.organizationId,
    locationIds: locationScopes,
    departmentIds: departmentScopes,
    positionIds: positionScopes,
    userIds: userScopes,
    userSource: "employees",
  });

  if (!folderScopeValidation.ok) {
    const messageByField = {
      locations: "Hay locaciones invalidas en el alcance",
      departments: "Hay departamentos invalidos en el alcance",
      positions: "Hay puestos invalidos en el alcance",
      users: "Hay usuarios invalidos en el alcance",
    } as any;
    return { success: false, message: messageByField[folderScopeValidation.field] || "Error en el alcance" };
  }

  const { data, error } = await supabase
    .from("document_folders")
    .insert({
      organization_id: tenant.organizationId,
        parent_id: parentId,
        name,
        created_by: userData.user?.id ?? null,
        access_scope: {
          locations: locationScopes,
          department_ids: departmentScopes,
          position_ids: positionScopes,
          users: userScopes,
        },
      })
    .select("id")
    .single();

  if (error) {
    return { success: false, message: `No se pudo crear carpeta: ${error.message}` };
  }

  await logAuditEvent({
    action: "documents.folder.create",
    entityType: "document_folder",
    entityId: data?.id,
    organizationId: tenant.organizationId,
    metadata: { name, parentId },
    eventDomain: "documents",
    outcome: "success",
    severity: "medium",
  });

  revalidatePath("/app/documents");
  return { success: true, message: "Carpeta creada" };
}

export async function uploadOrganizationDocumentAction(prevState: any, formData: FormData) {
  const tenant = await requireTenantModule("documents");

  const titleInput = String(formData.get("title") ?? "").trim();
  const folderId = String(formData.get("folder_id") ?? "").trim() || null;
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  const file = formData.get("file");
  const rawLocationScopes = formData.getAll("location_scope").map(String);
  const rawDepartmentScopes = formData.getAll("department_scope").map(String);
  const rawPositionScopes = formData.getAll("position_scope").map(String);
  const rawUserScopes = formData.getAll("user_scope").map(String);

  const locationScopes = normalizeScopeSelection(rawLocationScopes, { allowAllToken: true });
  const departmentScopes = normalizeScopeSelection(rawDepartmentScopes, { allowAllToken: true });
  const positionScopes = normalizeScopeSelection(rawPositionScopes, { allowAllToken: true });
  const userScopes = normalizeScopeSelection(rawUserScopes, { allowAllToken: true });

  if (!(file instanceof File) || file.size === 0) {
    return { success: false, message: "Selecciona un archivo" };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { success: false, message: "El archivo supera el limite de 10MB" };
  }

  await ensureBucketExists();

  let analysis: Awaited<ReturnType<typeof analyzeUploadedFile>>;
  try {
    analysis = await analyzeUploadedFile(file);
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Archivo invalido" };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();

  if (folderId) {
    const { data: folder, error: folderError } = await supabase
      .from("document_folders")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", folderId)
      .maybeSingle();

    if (folderError || !folder) {
      return { success: false, message: "Carpeta invalida para esta empresa" };
    }
  }

  if (branchId) {
    const { data: branch, error: branchError } = await supabase
      .from("branches")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("id", branchId)
      .maybeSingle();

    if (branchError || !branch) {
      return { success: false, message: "Locacion invalida para esta empresa" };
    }
  }

  const uploadScopeValidation = await validateTenantScopeReferences({
    supabase,
    organizationId: tenant.organizationId,
    locationIds: locationScopes,
    departmentIds: departmentScopes,
    positionIds: positionScopes,
    userIds: userScopes,
    userSource: "employees",
  });

  if (!uploadScopeValidation.ok) {
    const messageByField = {
      locations: "Hay locaciones invalidas en el alcance",
      departments: "Hay departamentos invalidos en el alcance",
      positions: "Hay puestos invalidos en el alcance",
      users: "Hay usuarios invalidos en el alcance",
    } as any;
    return { success: false, message: messageByField[uploadScopeValidation.field] || "Error de alcance" };
  }

  const { data: existingDuplicate } = await supabase
    .from("documents")
    .select("id, file_path, mime_type, file_size_bytes")
    .eq("organization_id", tenant.organizationId)
    .eq("checksum_sha256", analysis.checksumSha256)
    .eq("file_size_bytes", file.size)
    .limit(1)
    .maybeSingle();

  const path = existingDuplicate?.file_path ?? `${tenant.organizationId}/${Date.now()}-${analysis.safeName}`;

  if (!isSafeTenantStoragePath(path, tenant.organizationId)) {
    return { success: false, message: "Ruta de archivo invalida para esta empresa" };
  }

  const supabaseAdmin = createSupabaseAdminClient();

  try {
    await assertPlanLimitForStorage(tenant.organizationId, file.size);
  } catch (error) {
    return {
      success: false,
      message: getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado. Actualiza tu plan para continuar.")
    };
  }

  if (!existingDuplicate) {
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(path, file, {
        contentType: analysis.normalizedMime,
        upsert: false,
      });

    if (uploadError) {
      return { success: false, message: `No se pudo subir archivo: ${uploadError.message}` };
    }
  }

  const { data: document, error: documentError } = await supabase
    .from("documents")
    .insert({
      organization_id: tenant.organizationId,
      branch_id: branchId,
      folder_id: folderId,
      owner_user_id: authData.user?.id ?? null,
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
      await supabaseAdmin.storage.from(BUCKET_NAME).remove([path]);
    }
    return {
      success: false,
      message: `No se pudo registrar documento: ${documentError.message}`
    };
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
    branchId: branchId,
    metadata: { title: titleInput || file.name, folderId, size: file.size },
    eventDomain: "documents",
    outcome: "success",
    severity: "high",
  });

  revalidatePath("/app/documents");
  return { success: true, message: "Documento subido" };
}
