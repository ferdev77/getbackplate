import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

export function hasExplicitScopeValue(scope: unknown): boolean {
  if (!scope || typeof scope !== "object") return false;
  const value = scope as Record<string, unknown>;
  const locations = Array.isArray(value.locations) ? value.locations : [];
  const departments = Array.isArray(value.department_ids) ? value.department_ids : [];
  const positions = Array.isArray(value.position_ids) ? value.position_ids : [];
  const users = Array.isArray(value.users) ? value.users : [];
  return locations.length > 0 || departments.length > 0 || positions.length > 0 || users.length > 0;
}

type FolderScopeOwner = { access_scope: unknown };

export function resolveDocumentEffectiveScope(
  doc: { folder_id: string | null; access_scope: unknown },
  folderById: Map<string, FolderScopeOwner>
): unknown {
  if (!doc.folder_id) return doc.access_scope;
  return hasExplicitScopeValue(doc.access_scope)
    ? doc.access_scope
    : (folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope);
}

type EmployeeDocumentAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  branchIds?: string[];
  departmentId: string | null;
  positionIds?: string[];
  isDirectlyAssigned: boolean;
  accessScope: unknown;
};

export function canReadDocumentInTenant(input: EmployeeDocumentAccessInput) {
  if (input.roleCode === "company_admin") {
    return true;
  }

  if (input.isDirectlyAssigned) {
    return true;
  }

  const candidateBranchIds = [
    ...(input.branchIds ?? []),
    ...(input.branchId ? [input.branchId] : []),
  ];
  const uniqueBranchIds = [...new Set(candidateBranchIds.filter(Boolean))];

  if (uniqueBranchIds.length === 0) {
    return canSubjectAccessScope(input.accessScope, {
      userId: input.userId,
      locationId: input.branchId,
      departmentId: input.departmentId,
      positionIds: input.positionIds ?? [],
    });
  }

  return uniqueBranchIds.some((locationId) =>
    canSubjectAccessScope(input.accessScope, {
      userId: input.userId,
      locationId,
      departmentId: input.departmentId,
      positionIds: input.positionIds ?? [],
    }),
  );
}
