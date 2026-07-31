import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { combinarLocaciones } from "@/modules/employees/lib/location-sources";

// Returns the set of branch IDs an HR-delegated employee can manage.
// null means "all locations" (no filter needed).
export async function resolveHrScope(
  organizationId: string,
  userId: string,
): Promise<string[] | null> {
  const admin = createSupabaseAdminClient();
  const { data: actor } = await admin
    .from("employees")
    .select("all_locations, location_scope_ids, branch_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!actor) return [];
  if (actor.all_locations) return null;

  const ids = Array.from(
    new Set([
      ...(Array.isArray(actor.location_scope_ids) ? actor.location_scope_ids : []),
      ...(actor.branch_id ? [actor.branch_id] : []),
    ]),
  );
  return ids;
}

export function isEmployeeInScope(
  record: { branch_id?: string | null; location_scope_ids?: string[] | null; all_locations?: boolean | null },
  scopeIds: string[] | null,
): boolean {
  if (!scopeIds) return true;
  if (scopeIds.length === 0) return false;
  if (record.all_locations) return true;
  const recordBranches = Array.from(
    new Set([
      ...(record.branch_id ? [record.branch_id] : []),
      ...(Array.isArray(record.location_scope_ids) ? record.location_scope_ids : []),
    ]),
  );
  return recordBranches.some((id) => scopeIds.includes(id));
}

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

  const { data: branches } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  // La regla vive en combinarLocaciones: aca solo se traen las fuentes.
  return combinarLocaciones({
    fuentes: [employeeRow, ...(membershipRows ?? [])],
    todasLasLocaciones: (branches ?? []).map((row) => row.id).filter(Boolean),
  }).locationIds;
}
