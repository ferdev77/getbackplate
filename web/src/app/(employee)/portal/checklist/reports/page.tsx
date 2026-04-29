import { ChecklistReportsDashboard } from "@/modules/reports/ui/checklist-reports-dashboard";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { buildChecklistReportsSnapshot } from "@/modules/reports/services/checklist-reports-snapshot";
import { requireEmployeeModule } from "@/shared/lib/access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { resolveEmployeeLocationScope } from "@/shared/lib/employee-location-scope";

export default async function EmployeeChecklistReportsPage() {
  const tenant = await requireEmployeeModule("checklists");
  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );
  const authClient = await createSupabaseServerClient();
  const { data: authData } = await authClient.auth.getUser();
  const userId = authData.user?.id;

  if (!delegatedPermissions.checklists.create || !userId) {
    return null;
  }

  const supabase = authClient;
  const [{ data: employeeRow }, { data: membershipRows }] = await Promise.all([
    supabase
      .from("employees")
      .select("branch_id, all_locations")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("memberships")
      .select("branch_id, all_locations")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", userId)
      .eq("status", "active")
      .limit(20),
  ]);

  const locationScope = await resolveEmployeeLocationScope(supabase, tenant.organizationId, {
    tenantBranchId: tenant.branchId,
    employeeBranchId: employeeRow?.branch_id ?? null,
    membershipRows,
    employeeAllLocations: employeeRow?.all_locations ?? false,
  });
  const activeLocationIds = locationScope.locationIds;

  const admin = createSupabaseAdminClient();
  const snapshot = await buildChecklistReportsSnapshot({
    supabase: admin,
    organizationId: tenant.organizationId,
    templateCreatorUserId: userId,
    visibleBranchIds: activeLocationIds,
  });

  return (
    <ChecklistReportsDashboard
      organizationId={tenant.organizationId}
      generatedAt={snapshot.generatedAt}
      statCards={snapshot.statCards}
      locationCards={snapshot.locationCards}
      reports={snapshot.reports}
      attentionFeed={snapshot.attentionFeed}
      deferredDataUrl="/api/employee/checklists/reports"
      reviewEndpoint="/api/employee/checklists/review"
    />
  );
}
