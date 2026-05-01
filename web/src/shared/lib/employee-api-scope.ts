import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export async function resolveEmployeeAllowedLocationIds(
  organizationId: string,
  userId: string,
): Promise<string[]> {
  const admin = createSupabaseAdminClient();

  const [{ data: employeeRow }, { data: membershipRows }] = await Promise.all([
    admin
      .from("employees")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("memberships")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const hasAllLocations =
    employeeRow?.all_locations === true ||
    (membershipRows ?? []).some((row) => row.all_locations === true);

  if (hasAllLocations) {
    const { data: branches } = await admin
      .from("branches")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    return (branches ?? []).map((row) => row.id).filter(Boolean);
  }

  const explicitIds = [
    employeeRow?.branch_id,
    ...((Array.isArray(employeeRow?.location_scope_ids) ? employeeRow.location_scope_ids : [])),
    ...((membershipRows ?? []).map((row) => row.branch_id)),
    ...((membershipRows ?? []).flatMap((row) =>
      Array.isArray(row.location_scope_ids) ? row.location_scope_ids : [],
    )),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(explicitIds)];
}
