import { redirect } from "next/navigation";

import { requireEmployeeModule } from "@/shared/lib/access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { listMaintenanceRequests } from "@/modules/maintenance/services";
import { MaintenanceWorkspace } from "@/modules/maintenance/ui/maintenance-workspace";
import { getCurrentUser } from "@/modules/memberships/queries";

export default async function EmployeeMaintenancePage() {
  const tenant = await requireEmployeeModule("maintenance");
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");

  const permissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );

  const canView = permissions.maintenance.view;
  const canCreate = permissions.maintenance.create;
  const canRespond = permissions.maintenance.edit;

  if (!canView && !canCreate && !canRespond) {
    redirect("/portal/home?status=error&message=" + encodeURIComponent("No tenes permisos de mantenimiento"));
  }

  const { requests, catalog } = await listMaintenanceRequests(
    {
      organizationId: tenant.organizationId,
      userId: user.id,
      branchId: tenant.branchId,
      roleCode: tenant.roleCode,
    },
    { scope: "employee", status: "open" },
  );

  return (
    <MaintenanceWorkspace
      mode="employee"
      apiBase="/api/employee/maintenance"
      canCreate={canCreate}
      canRespond={canRespond}
      initialRequests={requests}
      currentUserId={user.id}
      initialCatalog={catalog}
      branches={catalog.branches}
    />
  );
}
