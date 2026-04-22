import { canSubjectAccessScope } from "@/shared/lib/scope-policy";

type AnnouncementAccessInput = {
  roleCode: string;
  userId: string;
  branchId: string | null;
  departmentId: string | null;
  positionIds?: string[];
  targetScope: unknown;
};

export function canReadAnnouncementInTenant(input: AnnouncementAccessInput) {
  if (input.roleCode === "company_admin") {
    return true;
  }

  return canSubjectAccessScope(input.targetScope, {
    userId: input.userId,
    locationId: input.branchId,
    departmentId: input.departmentId,
    positionIds: input.positionIds ?? [],
  });
}
