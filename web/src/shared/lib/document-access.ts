import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

type EmployeeDocumentAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
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

  return canSubjectAccessScope(input.accessScope, {
    userId: input.userId,
    locationId: input.branchId,
    departmentId: input.departmentId,
    positionIds: input.positionIds ?? [],
  });
}
