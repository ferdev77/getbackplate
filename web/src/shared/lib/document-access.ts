type ScopeKey = "locations" | "users" | "department_ids" | "position_ids";

type DocumentAccessScope = {
  locations?: unknown;
  users?: unknown;
  department_ids?: unknown;
  position_ids?: unknown;
};

type EmployeeDocumentAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  departmentId: string | null;
  positionIds?: string[];
  isDirectlyAssigned: boolean;
  accessScope: unknown;
};

function readScopeList(scope: DocumentAccessScope, key: ScopeKey): string[] {
  const value = scope[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function canReadDocumentInTenant(input: EmployeeDocumentAccessInput) {
  if (input.roleCode === "company_admin" || input.roleCode === "manager") {
    return true;
  }

  if (input.isDirectlyAssigned) {
    return true;
  }

  const scope =
    typeof input.accessScope === "object" && input.accessScope !== null
      ? (input.accessScope as DocumentAccessScope)
      : {};

  const scopedUsers = readScopeList(scope, "users");
  const scopedLocations = readScopeList(scope, "locations");
  const scopedDepartments = readScopeList(scope, "department_ids");
  const scopedPositions = readScopeList(scope, "position_ids");

  const hasAnyScope =
    scopedUsers.length > 0 ||
    scopedLocations.length > 0 ||
    scopedDepartments.length > 0 ||
    scopedPositions.length > 0;

  if (!hasAnyScope) {
    return true;
  }

  if (scopedUsers.includes(input.userId)) {
    return true;
  }

  if (input.branchId && scopedLocations.includes(input.branchId)) {
    return true;
  }

  if (input.departmentId && scopedDepartments.includes(input.departmentId)) {
    return true;
  }

  const employeePositionIds = input.positionIds ?? [];
  if (employeePositionIds.some((value) => scopedPositions.includes(value))) {
    return true;
  }

  return false;
}
