import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

type AccessScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

function normalizeEmployeeFolderName(input: string | null | undefined) {
  const value = String(input ?? "").trim().replace(/\s+/g, " ");
  return value || "Empleado";
}

async function resolveEmployeeIdentity(organizationId: string, userId: string) {
  const admin = createSupabaseAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select("first_name, last_name, branch_id, department_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (employee) {
    return {
      name: normalizeEmployeeFolderName(`${employee.first_name ?? ""} ${employee.last_name ?? ""}`),
      scope: {
        locations: employee.branch_id ? [employee.branch_id] : [],
        department_ids: employee.department_id ? [employee.department_id] : [],
        position_ids: [],
        users: [],
      } satisfies AccessScope,
    };
  }

  const { data: profile } = await admin
    .from("organization_user_profiles")
    .select("first_name, last_name")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    name: normalizeEmployeeFolderName(`${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`),
    scope: {
      locations: [],
      department_ids: [],
      position_ids: [],
      users: [],
    } satisfies AccessScope,
  };
}

export async function ensureEmployeeDocumentsRootFolder(input: {
  organizationId: string;
  userId: string;
}) {
  const admin = createSupabaseAdminClient();
  const identity = await resolveEmployeeIdentity(input.organizationId, input.userId);

  const { data: existingRoots } = await admin
    .from("document_folders")
    .select("id, name")
    .eq("organization_id", input.organizationId)
    .eq("created_by", input.userId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  let rootFolder = (existingRoots ?? []).find((folder) => folder.name === identity.name) ?? null;

  if (!rootFolder) {
    const { data: created, error: createError } = await admin
      .from("document_folders")
      .insert({
        organization_id: input.organizationId,
        parent_id: null,
        name: identity.name,
        created_by: input.userId,
        access_scope: identity.scope,
      })
      .select("id, name")
      .single();

    if (createError || !created) {
      throw new Error(createError?.message ?? "No se pudo crear carpeta raíz de documentos del empleado");
    }

    rootFolder = created;
  }

  return {
    folderId: rootFolder.id,
    folderName: identity.name,
  };
}

export async function backfillEmployeeDocumentsIntoRoot(input: {
  organizationId: string;
  userId: string;
  rootFolderId: string;
}) {
  const admin = createSupabaseAdminClient();

  const { error: foldersError } = await admin
    .from("document_folders")
    .update({ parent_id: input.rootFolderId })
    .eq("organization_id", input.organizationId)
    .eq("created_by", input.userId)
    .is("parent_id", null)
    .neq("id", input.rootFolderId);

  if (foldersError) {
    throw new Error(foldersError.message);
  }

  const { error: documentsError } = await admin
    .from("documents")
    .update({ folder_id: input.rootFolderId })
    .eq("organization_id", input.organizationId)
    .eq("owner_user_id", input.userId)
    .is("folder_id", null)
    .is("deleted_at", null);

  if (documentsError) {
    throw new Error(documentsError.message);
  }
}
