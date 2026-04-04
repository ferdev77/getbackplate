import { ChecklistReportsDashboard } from "@/modules/reports/ui/checklist-reports-dashboard";
import { requireTenantModule } from "@/shared/lib/access";

export default async function CompanyReportsPage() {
  const tenant = await requireTenantModule("reports");

  return (
    <ChecklistReportsDashboard
      organizationId={tenant.organizationId}
      generatedAt="Cargando..."
      statCards={[]}
      locationCards={[]}
      reports={[]}
      attentionFeed={[]}
      deferredDataUrl="/api/company/reports"
    />
  );
}
