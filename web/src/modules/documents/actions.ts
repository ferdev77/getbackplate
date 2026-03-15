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

import { z } from "zod";

const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Nombre de carpeta requerido"),
  parent_id: z.string().trim().optional().transform(v => v || null),
  location_scope: z.array(z.string()).default([]),
  department_scope: z.array(z.string()).default([]),
  position_scope: z.array(z.string()).default([]),
  user_scope: z.array(z.string()).default([]),
});

export async function createDocumentFolderAction(prevState: any, formData: FormData) {
  const tenant = await requireTenantModule("documents");

  const parsed = createFolderSchema.safeParse({
    name: formData.get("name"),
    parent_id: formData.get("parent_id"),
    location_scope: formData.getAll("location_scope").map(String),
    department_scope: formData.getAll("department_scope").map(String),
    position_scope: formData.getAll("position_scope").map(String),
    user_scope: formData.getAll("user_scope").map(String),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Datos de carpeta invalidos" };
  }

  const { name, parent_id: parentId } = parsed.data;
  const locationScopes = normalizeScopeSelection(parsed.data.location_scope);
  const departmentScopes = normalizeScopeSelection(parsed.data.department_scope);
  const positionScopes = normalizeScopeSelection(parsed.data.position_scope);
  const userScopes = normalizeScopeSelection(parsed.data.user_scope);

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

const uploadDocumentSchema = z.object({
  title: z.string().trim().optional(),
  folder_id: z.string().trim().optional().transform(v => v || null),
  branch_id: z.string().trim().optional().transform(v => v || null),
  location_scope: z.array(z.string()).default([]),
  department_scope: z.array(z.string()).default([]),
  position_scope: z.array(z.string()).default([]),
  user_scope: z.array(z.string()).default([]),
});

export async function uploadOrganizationDocumentAction(prevState: any, formData: FormData) {
  const tenant = await requireTenantModule("documents");

  const parsed = uploadDocumentSchema.safeParse({
    title: formData.get("title"),
    folder_id: formData.get("folder_id"),
    branch_id: formData.get("branch_id"),
    location_scope: formData.getAll("location_scope").map(String),
    department_scope: formData.getAll("department_scope").map(String),
    position_scope: formData.getAll("position_scope").map(String),
    user_scope: formData.getAll("user_scope").map(String),
  });

  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Datos de documento invalidos" };
  }

  const titleInput = parsed.data.title;
  const folderId = parsed.data.folder_id;
  const branchId = parsed.data.branch_id;
  const file = formData.get("file");

  const locationScopes = normalizeScopeSelection(parsed.data.location_scope, { allowAllToken: true });
  const departmentScopes = normalizeScopeSelection(parsed.data.department_scope, { allowAllToken: true });
  const positionScopes = normalizeScopeSelection(parsed.data.position_scope, { allowAllToken: true });
  const userScopes = normalizeScopeSelection(parsed.data.user_scope, { allowAllToken: true });

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

  try {
    await assertPlanLimitForStorage(tenant.organizationId, file.size);
  } catch (error) {
    return {
      success: false,
      message: getPlanLimitErrorMessage(error, "Limite de almacenamiento alcanzado. Actualiza tu plan para continuar.")
    };
  }

  if (!existingDuplicate) {
    const { error: uploadError } = await supabase.storage
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
      await supabase.storage.from(BUCKET_NAME).remove([path]);
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

export async function getShareScopesCatalogsAction() {
  const tenant = await requireTenantModule("documents");
  const supabase = await createSupabaseServerClient();

  const [
    { data: employees },
    { data: positions }
  ] = await Promise.all([
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

  return {
    employees: employees ?? [],
    positions: positions ?? [],
  };
}
