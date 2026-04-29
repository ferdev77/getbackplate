import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

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
