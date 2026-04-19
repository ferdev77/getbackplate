import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  EMPLOYEE_PERMISSION_MODULES,
  getEmptyEmployeeDelegatedPermissions,
  normalizeEmployeeDelegatedPermissions,
  type EmployeeDelegatedPermissionsMap,
} from "@/shared/lib/employee-module-permissions";

export function parseDelegatedPermissionsFromFormData(formData: FormData): EmployeeDelegatedPermissionsMap {
  const raw = String(formData.get("delegated_permissions_json") ?? "").trim();
  if (!raw) return getEmptyEmployeeDelegatedPermissions();
  try {
    return normalizeEmployeeDelegatedPermissions(JSON.parse(raw));
  } catch {
    return getEmptyEmployeeDelegatedPermissions();
  }
}

export async function syncDelegatedEmployeePermissions(input: {
  organizationId: string;
  membershipId: string;
  actorId: string;
  permissions: EmployeeDelegatedPermissionsMap;
}) {
  const admin = createSupabaseAdminClient();
  const rows = EMPLOYEE_PERMISSION_MODULES.map((moduleCode) => ({
    organization_id: input.organizationId,
    membership_id: input.membershipId,
    module_code: moduleCode,
    can_create: input.permissions[moduleCode].create,
    can_edit: input.permissions[moduleCode].edit,
    can_delete: input.permissions[moduleCode].delete,
    granted_by: input.actorId,
  }));

  const { error } = await admin
    .from("employee_module_permissions")
    .upsert(rows, { onConflict: "organization_id,membership_id,module_code" });

  if (error) {
    return { error: `No se pudieron guardar permisos delegados: ${error.message}` };
  }

  return { error: null as string | null };
}

export async function clearDelegatedEmployeePermissionsByMembership(organizationId: string, membershipId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("employee_module_permissions")
    .delete()
    .eq("organization_id", organizationId)
    .eq("membership_id", membershipId);

  if (error) {
    return { error: `No se pudieron limpiar permisos delegados: ${error.message}` };
  }

  return { error: null as string | null };
}
