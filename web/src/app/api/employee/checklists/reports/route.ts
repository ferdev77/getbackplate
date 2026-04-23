import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { buildChecklistReportsSnapshot } from "@/modules/reports/services/checklist-reports-snapshot";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";

export async function GET() {
  const moduleAccess = await assertEmployeeCapabilityApi("checklists", "create");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: employeeRow }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("branch_id")
      .eq("organization_id", moduleAccess.tenant.organizationId)
      .eq("user_id", moduleAccess.userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("branch_id")
      .eq("organization_id", moduleAccess.tenant.organizationId)
      .eq("user_id", moduleAccess.userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const activeLocationIds = [...new Set([
    moduleAccess.tenant.branchId,
    employeeRow?.branch_id,
    ...(membershipRows ?? []).map((row) => row.branch_id),
  ].filter((value): value is string => Boolean(value)))];

  const admin = createSupabaseAdminClient();

  const snapshot = await buildChecklistReportsSnapshot({
    supabase: admin,
    organizationId: moduleAccess.tenant.organizationId,
    templateCreatorUserId: moduleAccess.userId,
    visibleBranchIds: activeLocationIds,
  });

  return NextResponse.json(snapshot);
}
