import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

type ChecklistTemplateAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  departmentId: string | null;
  positionIds?: string[];
  templateBranchId: string | null;
  targetScope: unknown;
};

export function canUseChecklistTemplateInTenant(input: ChecklistTemplateAccessInput) {
  if (input.roleCode === "company_admin") {
    return true;
  }

  const baseBranchMatch = input.templateBranchId
    ? Boolean(input.branchId && input.templateBranchId === input.branchId)
    : true;

  if (!baseBranchMatch) {
    return false;
  }

  return canSubjectAccessScope(input.targetScope, {
    userId: input.userId,
    locationId: input.branchId,
    departmentId: input.departmentId,
    positionIds: input.positionIds ?? [],
  });
}
