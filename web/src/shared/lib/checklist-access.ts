type ScopeKey = "locations" | "users" | "department_ids" | "position_ids";

type ChecklistScope = {
  locations?: unknown;
  users?: unknown;
  department_ids?: unknown;
  position_ids?: unknown;
};

type ChecklistTemplateAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  departmentId: string | null;
  positionIds?: string[];
  templateBranchId: string | null;
  templateDepartmentId: string | null;
  targetScope: unknown;
};

function readScopeList(scope: ChecklistScope, key: ScopeKey): string[] {
  const value = scope[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function canUseChecklistTemplateInTenant(input: ChecklistTemplateAccessInput) {
  if (input.roleCode === "company_admin") {
    return true;
  }

  const baseBranchMatch = input.templateBranchId
    ? Boolean(input.branchId && input.templateBranchId === input.branchId)
    : true;
  const baseDepartmentMatch = input.templateDepartmentId
    ? Boolean(input.departmentId && input.templateDepartmentId === input.departmentId)
    : true;

  if (!baseBranchMatch || !baseDepartmentMatch) {
    return false;
  }

  const scope =
    typeof input.targetScope === "object" && input.targetScope !== null
      ? (input.targetScope as ChecklistScope)
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

  const positionIds = input.positionIds ?? [];
  if (positionIds.some((value) => scopedPositions.includes(value))) {
    return true;
  }

  return false;
}
