import { ChecklistReportsDashboard } from "@/modules/reports/ui/checklist-reports-dashboard";
import { requireEmployeeModule } from "@/shared/lib/access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";

export default async function EmployeeChecklistReportsPage() {
  const tenant = await requireEmployeeModule("checklists");
  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );

  if (!delegatedPermissions.checklists.create) {
    return null;
  }

  return (
    <ChecklistReportsDashboard
      organizationId={tenant.organizationId}
      generatedAt="Cargando..."
      statCards={[]}
      locationCards={[]}
      reports={[]}
      attentionFeed={[]}
      deferredDataUrl="/api/employee/checklists/reports"
      reviewEndpoint="/api/employee/checklists/review"
    />
  );
}
