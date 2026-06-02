import { requireTenantModule } from "@/shared/lib/access";
import { listMaintenanceRequests } from "@/modules/maintenance/services";
import { MaintenanceWorkspace } from "@/modules/maintenance/ui/maintenance-workspace";

export default async function CompanyMaintenancePage() {
  const tenant = await requireTenantModule("maintenance");

  const { requests, catalog } = await listMaintenanceRequests(
    {
      organizationId: tenant.organizationId,
      userId: "",
      branchId: tenant.branchId,
      roleCode: tenant.roleCode,
    },
    { scope: "company", status: "open" },
  );

  return (
    <MaintenanceWorkspace
      mode="company"
      apiBase="/api/company/maintenance"
      canCreate
      canRespond
      initialRequests={requests}
      branches={catalog.branches}
    />
  );
}
