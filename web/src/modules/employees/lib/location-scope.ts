import type { SupabaseClient } from "@supabase/supabase-js";

import { combinarLocaciones } from "@/modules/employees/lib/location-sources";

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
  const { data: branches } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  // La regla vive en combinarLocaciones, compartida con el resto.
  const { locationIds, alcanzaTodas } = combinarLocaciones({
    fuentes: [
      {
        branch_id: input.employeeBranchId,
        all_locations: input.employeeAllLocations,
        location_scope_ids: input.employeeLocationIds ?? null,
      },
      ...(input.membershipRows ?? []),
    ],
    todasLasLocaciones: (branches ?? []).map((row) => row.id).filter(Boolean),
    locacionDelContexto: input.tenantBranchId,
  });

  return {
    hasAllLocations: alcanzaTodas,
    locationIds,
    primaryLocationId: locationIds[0] ?? null,
  };
}
