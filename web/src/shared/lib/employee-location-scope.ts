import type { SupabaseClient } from "@supabase/supabase-js";

type EmployeeScopeInput = {
  tenantBranchId: string | null;
  employeeBranchId: string | null;
  employeeLocationIds?: string[] | null;
  membershipRows?: Array<{ branch_id: string | null; all_locations?: boolean | null; location_scope_ids?: string[] | null }> | null;
  employeeAllLocations?: boolean | null;
};

export async function resolveEmployeeLocationScope(
  supabase: SupabaseClient,
  organizationId: string,
  input: EmployeeScopeInput,
) {
  const explicitIds = [
    input.tenantBranchId,
    input.employeeBranchId,
    ...((input.employeeLocationIds ?? [])),
    ...((input.membershipRows ?? []).map((row) => row.branch_id)),
    ...((input.membershipRows ?? []).flatMap((row) => row.location_scope_ids ?? [])),
  ].filter((value): value is string => Boolean(value));

  const hasAllLocations =
    input.employeeAllLocations === true ||
    (input.membershipRows ?? []).some((row) => row.all_locations === true);

  if (!hasAllLocations) {
    const locationIds = [...new Set(explicitIds)];
    return {
      hasAllLocations: false,
      locationIds,
      primaryLocationId: locationIds[0] ?? null,
    };
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  const locationIds = [...new Set((branches ?? []).map((row) => row.id).filter(Boolean))];
  return {
    hasAllLocations: true,
    locationIds,
    primaryLocationId: locationIds[0] ?? null,
  };
}
