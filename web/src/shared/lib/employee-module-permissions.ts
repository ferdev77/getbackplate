import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export const EMPLOYEE_PERMISSION_MODULES = ["announcements", "checklists", "documents", "ai_assistant"] as const;
export type EmployeePermissionModuleCode = (typeof EMPLOYEE_PERMISSION_MODULES)[number];
export type EmployeePermissionCapability = "create" | "edit" | "delete";

export type EmployeeModulePermissionFlags = {
  create: boolean;
  edit: boolean;
  delete: boolean;
};

export type EmployeeDelegatedPermissionsMap = Record<EmployeePermissionModuleCode, EmployeeModulePermissionFlags>;

export function getEmptyEmployeeDelegatedPermissions(): EmployeeDelegatedPermissionsMap {
  return {
    announcements: { create: false, edit: false, delete: false },
    checklists: { create: false, edit: false, delete: false },
    documents: { create: false, edit: false, delete: false },
    ai_assistant: { create: false, edit: false, delete: false },
  };
}

function toBoolean(value: unknown) {
  return value === true;
}

export function normalizeEmployeeDelegatedPermissions(input: unknown): EmployeeDelegatedPermissionsMap {
  const base = getEmptyEmployeeDelegatedPermissions();
  if (!input || typeof input !== "object") return base;

  const raw = input as Record<string, unknown>;
  for (const moduleCode of EMPLOYEE_PERMISSION_MODULES) {
    const moduleValue = raw[moduleCode];
    if (!moduleValue || typeof moduleValue !== "object") continue;
    const moduleRecord = moduleValue as Record<string, unknown>;
    base[moduleCode] = {
      create: toBoolean(moduleRecord.create),
      edit: toBoolean(moduleRecord.edit),
      delete: toBoolean(moduleRecord.delete),
    };
  }

  return base;
}

export async function getEmployeeDelegatedPermissionsByMembership(
  organizationId: string,
  membershipId: string,
): Promise<EmployeeDelegatedPermissionsMap> {
  if (!organizationId || !membershipId) {
    return getEmptyEmployeeDelegatedPermissions();
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("employee_module_permissions")
    .select("module_code, can_create, can_edit, can_delete")
    .eq("organization_id", organizationId)
    .eq("membership_id", membershipId)
    .in("module_code", [...EMPLOYEE_PERMISSION_MODULES]);

  const result = getEmptyEmployeeDelegatedPermissions();
  for (const row of data ?? []) {
    const moduleCode = row.module_code as EmployeePermissionModuleCode;
    if (!EMPLOYEE_PERMISSION_MODULES.includes(moduleCode)) continue;
    result[moduleCode] = {
      create: row.can_create === true,
      edit: row.can_edit === true,
      delete: row.can_delete === true,
    };
  }

  return result;
}

export function hasEmployeeDelegatedCapability(
  permissions: EmployeeDelegatedPermissionsMap,
  moduleCode: EmployeePermissionModuleCode,
  capability: EmployeePermissionCapability,
) {
  return permissions[moduleCode]?.[capability] === true;
}
