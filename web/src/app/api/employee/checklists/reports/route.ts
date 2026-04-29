import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { buildChecklistReportsSnapshot } from "@/modules/reports/services/checklist-reports-snapshot";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { resolveEmployeeLocationScope } from "@/shared/lib/employee-location-scope";

export async function GET() {
  const moduleAccess = await assertEmployeeCapabilityApi("checklists", "create");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: employeeRow }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", moduleAccess.tenant.organizationId)
      .eq("user_id", moduleAccess.userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("branch_id, all_locations, location_scope_ids")
      .eq("organization_id", moduleAccess.tenant.organizationId)
      .eq("user_id", moduleAccess.userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const locationScope = await resolveEmployeeLocationScope(supabase, moduleAccess.tenant.organizationId, {
    tenantBranchId: moduleAccess.tenant.branchId,
    employeeBranchId: employeeRow?.branch_id ?? null,
    employeeLocationIds: employeeRow?.location_scope_ids ?? [],
    membershipRows,
    employeeAllLocations: employeeRow?.all_locations ?? false,
  });
  const activeLocationIds = locationScope.locationIds;

  const admin = createSupabaseAdminClient();

  const snapshot = await buildChecklistReportsSnapshot({
    supabase: admin,
    organizationId: moduleAccess.tenant.organizationId,
    templateCreatorUserId: moduleAccess.userId,
    visibleBranchIds: activeLocationIds,
  });

  return NextResponse.json(snapshot);
}
