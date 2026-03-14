import { cache } from "react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { hasPublicSupabaseEnv } from "@/shared/lib/env";

export type MembershipContext = {
  membershipId: string;
  organizationId: string;
  roleId: string;
  branchId: string | null;
  roleCode: string;
  createdAt: string;
};

const ROLE_PRIORITY: Record<string, number> = {
  company_admin: 0,
  manager: 1,
  employee: 2,
};

function sortMembershipsDeterministically(rows: MembershipContext[]) {
  return [...rows].sort((a, b) => {
    const priorityA = ROLE_PRIORITY[a.roleCode] ?? 99;
    const priorityB = ROLE_PRIORITY[b.roleCode] ?? 99;
    if (priorityA !== priorityB) return priorityA - priorityB;

    if (a.createdAt !== b.createdAt) {
      return a.createdAt > b.createdAt ? -1 : 1;
    }

    return a.membershipId.localeCompare(b.membershipId);
  });
}

export function resolvePreferredMembership(
  memberships: MembershipContext[],
  preferredOrganizationId?: string | null,
) {
  if (!memberships.length) {
    return {
      selected: null,
      requiresSelection: false,
      organizationsCount: 0,
    };
  }

  const organizationsCount = new Set(memberships.map((row) => row.organizationId)).size;
  const sorted = sortMembershipsDeterministically(memberships);

  if (preferredOrganizationId) {
    const preferred = sorted.find((row) => row.organizationId === preferredOrganizationId);
    if (preferred) {
      return {
        selected: preferred,
        requiresSelection: false,
        organizationsCount,
      };
    }
  }

  if (organizationsCount > 1) {
    return {
      selected: null,
      requiresSelection: true,
      organizationsCount,
    };
  }

  return {
    selected: sorted[0] ?? null,
    requiresSelection: false,
    organizationsCount,
  };
}

export const getCurrentUser = cache(async function getCurrentUser() {
  if (!hasPublicSupabaseEnv()) {
    return null;
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const getCurrentUserMemberships = cache(async function getCurrentUserMemberships() {
  const user = await getCurrentUser();

  if (!user) {
    return [];
  }

  const supabase = await createSupabaseServerClient();
  const { data: memberships } = await supabase
    .from("memberships")
    .select("id, organization_id, role_id, branch_id, created_at, roles!inner(code)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  return (memberships ?? []).map((row) => ({
    membershipId: row.id,
    organizationId: row.organization_id,
    roleId: row.role_id,
    branchId: row.branch_id,
    roleCode: Array.isArray(row.roles) ? row.roles[0]?.code ?? "" : (row.roles as any)?.code ?? "",
    createdAt: row.created_at,
  }));
});

export async function getTenantContext(preferredOrganizationId?: string | null) {
  const memberships = await getCurrentUserMemberships();
  return resolvePreferredMembership(memberships, preferredOrganizationId).selected;
}

export async function isCurrentUserSuperadmin() {
  if (!hasPublicSupabaseEnv()) {
    return false;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("is_superadmin");

  if (error) {
    return false;
  }

  return Boolean(data);
}
