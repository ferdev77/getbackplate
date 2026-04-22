import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  COMPANY_ONLY_SCOPE_USER_TOKEN,
  EMPLOYEE_DOCUMENTS_ROOT_NAME,
  getSystemFolderType,
} from "@/shared/lib/employee-documents-folders-contract";

type AccessScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
  _system_folder_type?: "employees_root" | "employee_home";
};

type FolderLite = {
  id: string;
  name: string;
  parent_id: string | null;
  created_by?: string | null;
  access_scope?: unknown;
};

function employeesRootScope(): AccessScope {
  return {
    locations: [],
    department_ids: [],
    position_ids: [],
    users: [COMPANY_ONLY_SCOPE_USER_TOKEN],
    _system_folder_type: "employees_root",
  };
}

function normalizeEmployeeFolderName(input: string | null | undefined) {
  const value = String(input ?? "").trim().replace(/\s+/g, " ");
  return value || "Empleado";
}

function employeeHomeScope(base: AccessScope, userId: string): AccessScope {
  return {
    ...base,
    users: [userId],
    _system_folder_type: "employee_home",
  };
}

export function isProtectedEmployeeDocumentsFolder(folder: {
  id?: string;
  access_scope?: unknown;
  parent_id?: string | null;
}, employeesRootFolderId: string | null) {
  const systemType = getSystemFolderType(folder.access_scope ?? null);
  if (systemType === "employees_root" || systemType === "employee_home") return true;
  if (employeesRootFolderId && folder.id === employeesRootFolderId) return true;
  if (employeesRootFolderId && folder.parent_id === employeesRootFolderId) return true;
  return false;
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
        users: [userId],
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
      users: [userId],
    } satisfies AccessScope,
  };
}

async function ensureEmployeesGlobalRoot(organizationId: string) {
  const admin = createSupabaseAdminClient();

  const { data: allRootFolders } = await admin
    .from("document_folders")
    .select("id, name, parent_id, created_by, access_scope")
    .eq("organization_id", organizationId)
    .is("parent_id", null)
    .order("created_at", { ascending: true });

  const existingSystemRoot = (allRootFolders ?? []).find(
    (folder) => getSystemFolderType(folder.access_scope) === "employees_root",
  );

  if (existingSystemRoot) {
    return existingSystemRoot as FolderLite;
  }

  const legacyByName = (allRootFolders ?? []).find(
    (folder) => String(folder.name ?? "").trim().toLowerCase() === EMPLOYEE_DOCUMENTS_ROOT_NAME.toLowerCase(),
  );

  if (legacyByName) {
    const { error: patchLegacyError } = await admin
      .from("document_folders")
      .update({ access_scope: employeesRootScope(), created_by: null })
      .eq("organization_id", organizationId)
      .eq("id", legacyByName.id);

    if (patchLegacyError) throw new Error(patchLegacyError.message);
    return {
      id: legacyByName.id,
      name: EMPLOYEE_DOCUMENTS_ROOT_NAME,
      parent_id: null,
      created_by: null,
      access_scope: employeesRootScope(),
    };
  }

  const { data: createdRoot, error: createRootError } = await admin
    .from("document_folders")
    .insert({
      organization_id: organizationId,
      parent_id: null,
      name: EMPLOYEE_DOCUMENTS_ROOT_NAME,
      created_by: null,
      access_scope: employeesRootScope(),
    })
    .select("id, name, parent_id, created_by, access_scope")
    .single();

  if (createRootError || !createdRoot) {
    throw new Error(createRootError?.message ?? "No se pudo crear carpeta raíz de empleados");
  }

  return createdRoot as FolderLite;
}

export async function getEmployeesRootFolderId(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("document_folders")
    .select("id, name, access_scope, parent_id")
    .eq("organization_id", organizationId)
    .is("parent_id", null);

  const root = (data ?? []).find((folder) => getSystemFolderType(folder.access_scope) === "employees_root")
    ?? (data ?? []).find((folder) => String(folder.name ?? "").trim().toLowerCase() === EMPLOYEE_DOCUMENTS_ROOT_NAME.toLowerCase());
  return root?.id ?? null;
}

export async function ensureEmployeeDocumentsRootFolder(input: {
  organizationId: string;
  userId: string;
}) {
  const admin = createSupabaseAdminClient();
  const identity = await resolveEmployeeIdentity(input.organizationId, input.userId);
  const employeesRoot = await ensureEmployeesGlobalRoot(input.organizationId);

  const { data: employeeFolders } = await admin
    .from("document_folders")
    .select("id, name, parent_id, created_by, access_scope")
    .eq("organization_id", input.organizationId)
    .eq("created_by", input.userId)
    .order("created_at", { ascending: true });

  let rootFolder = (employeeFolders ?? []).find(
    (folder) => folder.parent_id === employeesRoot.id && getSystemFolderType(folder.access_scope) === "employee_home",
  ) as FolderLite | undefined;

  if (!rootFolder) {
    const legacyRoot = (employeeFolders ?? []).find((folder) => folder.parent_id === null) as FolderLite | undefined;
    if (legacyRoot) {
      const { error: moveLegacyError } = await admin
        .from("document_folders")
        .update({
          parent_id: employeesRoot.id,
          name: identity.name,
          access_scope: employeeHomeScope(identity.scope, input.userId),
        })
        .eq("organization_id", input.organizationId)
        .eq("id", legacyRoot.id);
      if (moveLegacyError) throw new Error(moveLegacyError.message);
      rootFolder = {
        ...legacyRoot,
        parent_id: employeesRoot.id,
        name: identity.name,
        access_scope: employeeHomeScope(identity.scope, input.userId),
      };
    }
  }

  if (!rootFolder) {
    const { data: created, error: createError } = await admin
      .from("document_folders")
      .insert({
        organization_id: input.organizationId,
        parent_id: employeesRoot.id,
        name: identity.name,
        created_by: input.userId,
        access_scope: employeeHomeScope(identity.scope, input.userId),
      })
      .select("id, name, parent_id, access_scope")
      .single();

    if (createError || !created) {
      throw new Error(createError?.message ?? "No se pudo crear carpeta raíz de documentos del empleado");
    }

    rootFolder = created;
  } else {
    const currentType = getSystemFolderType(rootFolder.access_scope);
    const expectedScope = employeeHomeScope(identity.scope, input.userId);
    if (rootFolder.name !== identity.name || rootFolder.parent_id !== employeesRoot.id || currentType !== "employee_home") {
      const { error: syncError } = await admin
        .from("document_folders")
        .update({
          name: identity.name,
          parent_id: employeesRoot.id,
          access_scope: expectedScope,
        })
        .eq("organization_id", input.organizationId)
        .eq("id", rootFolder.id);
      if (syncError) throw new Error(syncError.message);
    }
  }

  return {
    folderId: rootFolder.id,
    folderName: identity.name,
    employeesRootFolderId: employeesRoot.id,
  };
}

export async function backfillEmployeeDocumentsIntoRoot(input: {
  organizationId: string;
  userId: string;
  rootFolderId: string;
  employeesRootFolderId?: string | null;
}) {
  const admin = createSupabaseAdminClient();

  const { data: employeeFolders } = await admin
    .from("document_folders")
    .select("id, parent_id")
    .eq("organization_id", input.organizationId)
    .eq("created_by", input.userId);

  for (const folder of employeeFolders ?? []) {
    if (folder.id === input.rootFolderId) continue;
    if (folder.parent_id === null) {
      const { error: moveError } = await admin
        .from("document_folders")
        .update({ parent_id: input.rootFolderId })
        .eq("organization_id", input.organizationId)
        .eq("id", folder.id);
      if (moveError) throw new Error(moveError.message);
    }
  }

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
