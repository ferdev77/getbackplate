import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

type ChecklistTemplateAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  branchIds?: string[];
  departmentId: string | null;
  positionIds?: string[];
  templateBranchId: string | null;
  targetScope: unknown;
};

export function canUseChecklistTemplateInTenant(input: ChecklistTemplateAccessInput) {
  if (input.roleCode === "company_admin") {
    return true;
  }

  const candidateBranchIds = [
    ...(input.branchIds ?? []),
    ...(input.branchId ? [input.branchId] : []),
  ];
  const uniqueBranchIds = [...new Set(candidateBranchIds.filter(Boolean))];

  const baseBranchMatch = input.templateBranchId
    ? uniqueBranchIds.includes(input.templateBranchId)
    : true;

  if (!baseBranchMatch) {
    return false;
  }

  if (uniqueBranchIds.length === 0) {
    return canSubjectAccessScope(input.targetScope, {
      userId: input.userId,
      locationId: input.branchId,
      departmentId: input.departmentId,
      positionIds: input.positionIds ?? [],
    });
  }

  return uniqueBranchIds.some((locationId) =>
    canSubjectAccessScope(input.targetScope, {
      userId: input.userId,
      locationId,
      departmentId: input.departmentId,
      positionIds: input.positionIds ?? [],
    }),
  );
}
