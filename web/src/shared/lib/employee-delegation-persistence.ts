import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { revalidateDocumentsCaches } from "@/modules/documents/revalidate-cache";
import {
  EMPLOYEE_PERMISSION_MODULES,
  getEmptyEmployeeDelegatedPermissions,
  normalizeEmployeeDelegatedPermissions,
  type EmployeeDelegatedPermissionsMap,
} from "@/shared/lib/employee-module-permissions";
import {
  backfillEmployeeDocumentsIntoRoot,
  ensureEmployeeDocumentsRootFolder,
} from "@/shared/lib/employee-documents-root-folder";

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
    can_view: input.permissions[moduleCode].view,
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

  if (input.permissions.documents.create || input.permissions.documents.edit || input.permissions.documents.delete) {
    const { data: membership } = await admin
      .from("memberships")
      .select("user_id")
      .eq("organization_id", input.organizationId)
      .eq("id", input.membershipId)
      .maybeSingle();

    const targetUserId = membership?.user_id ?? null;
    if (targetUserId) {
      try {
        const root = await ensureEmployeeDocumentsRootFolder({
          organizationId: input.organizationId,
          userId: targetUserId,
        });

        await backfillEmployeeDocumentsIntoRoot({
          organizationId: input.organizationId,
          userId: targetUserId,
          rootFolderId: root.folderId,
        });
      } catch (ensureRootError) {
        return {
          error: `No se pudo preparar carpeta raíz de Documentos para empleado: ${
            ensureRootError instanceof Error ? ensureRootError.message : "error desconocido"
          }`,
        };
      }
    }
  }

  revalidateDocumentsCaches();

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

  revalidateDocumentsCaches();

  return { error: null as string | null };
}
