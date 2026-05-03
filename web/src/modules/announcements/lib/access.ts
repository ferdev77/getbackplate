import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

type AnnouncementAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  branchIds?: string[];
  departmentId: string | null;
  positionIds?: string[];
  targetScope: unknown;
};

export function canReadAnnouncementInTenant(input: AnnouncementAccessInput) {
  if (input.roleCode === "company_admin") {
    return true;
  }

  const candidateBranchIds = [
    ...(input.branchIds ?? []),
    ...(input.branchId ? [input.branchId] : []),
  ];
  const uniqueBranchIds = [...new Set(candidateBranchIds.filter(Boolean))];

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
