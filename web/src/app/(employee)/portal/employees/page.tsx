import { redirect } from "next/navigation";

import { requireEmployeeAccess } from "@/shared/lib/access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { EmployeesPageWorkspace } from "@/modules/employees/ui/employees-page-workspace";

export const revalidate = 0;

export default async function PortalEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; employeeId?: string; status?: string; message?: string }>;
}) {
  const tenant = await requireEmployeeAccess();

  const permissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );

  if (!permissions.employees.view) {
    redirect("/portal/home?status=error&message=" + encodeURIComponent("No tenés permisos de Recursos Humanos"));
  }

  const params = await searchParams;
  const action = String(params.action ?? "").trim().toLowerCase();
  const openEmployeeModal = action === "create" || action === "edit";
  const initialModalMode = action === "edit" ? "edit" : "create";

  return (
    <EmployeesPageWorkspace
      statusParam={params.status}
      messageParam={params.message}
      employees={[]}
      branches={[]}
      departments={[]}
      positions={[]}
      publisherName=""
      companyName=""
      initialModalOpen={openEmployeeModal}
      initialModalMode={initialModalMode}
      deferredDataUrl="/api/employee/employees?catalog=directory_page&limit=100&page=1"
      basePath="/portal/employees"
      canCreate={permissions.employees.create}
      canEdit={permissions.employees.edit}
      canDelete={permissions.employees.delete}
      hideDelegatedPermissions
      apiEndpoint="/api/employee/employees"
    />
  );
}
