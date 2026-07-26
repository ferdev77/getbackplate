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

type FolderScopeOwner = { id?: string; name?: string; parent_id: string | null; access_scope: unknown };

export type EffectiveScopeResult = {
  scope: unknown;
  /** true when the item's own explicit scope is used (nothing inherited) */
  isOwn: boolean;
  /** id of the folder whose scope is being borrowed, or null if own/fully-open */
  sourceFolderId: string | null;
  sourceFolderName: string | null;
};

const MAX_INHERITANCE_DEPTH = 50;

/**
 * Walks up the folder's parent chain until it finds one with an explicit
 * scope, mirroring resolve_folder_effective_scope() in Postgres — a folder
 * with no scope of its own inherits from its parent, recursively, not just
 * one level up.
 */
export function resolveFolderEffectiveScope(
  folderId: string,
  folderById: Map<string, FolderScopeOwner>,
): EffectiveScopeResult {
  const visited = new Set<string>();
  let currentId: string | null = folderId;
  let isFirst = true;
  let depth = 0;

  while (currentId && !visited.has(currentId) && depth < MAX_INHERITANCE_DEPTH) {
    visited.add(currentId);
    depth += 1;
    const folder = folderById.get(currentId);
    if (!folder) break;

    if (hasExplicitScopeValue(folder.access_scope)) {
      return {
        scope: folder.access_scope,
        isOwn: isFirst,
        sourceFolderId: folder.id ?? currentId,
        sourceFolderName: folder.name ?? null,
      };
    }

    currentId = folder.parent_id;
    isFirst = false;
  }

  return { scope: null, isOwn: true, sourceFolderId: null, sourceFolderName: null };
}

export function resolveDocumentEffectiveScope(
  doc: { folder_id: string | null; access_scope: unknown },
  folderById: Map<string, FolderScopeOwner>
): unknown {
  if (hasExplicitScopeValue(doc.access_scope)) return doc.access_scope;
  if (!doc.folder_id) return doc.access_scope;
  const resolved = resolveFolderEffectiveScope(doc.folder_id, folderById);
  return resolved.scope ?? doc.access_scope;
}

/**
 * Same as resolveDocumentEffectiveScope, but also reports whether the scope
 * is the document's own or inherited, and from which folder — used to show
 * the "Hereda de: X" / "Alcance propio" indicator in the UI.
 */
export function resolveDocumentEffectiveScopeWithSource(
  doc: { folder_id: string | null; access_scope: unknown },
  folderById: Map<string, FolderScopeOwner>,
): EffectiveScopeResult {
  if (hasExplicitScopeValue(doc.access_scope)) {
    return { scope: doc.access_scope, isOwn: true, sourceFolderId: null, sourceFolderName: null };
  }
  if (!doc.folder_id) {
    return { scope: doc.access_scope, isOwn: true, sourceFolderId: null, sourceFolderName: null };
  }
  return resolveFolderEffectiveScope(doc.folder_id, folderById);
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
