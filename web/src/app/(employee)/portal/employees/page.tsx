import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { resolveHrScope } from "@/modules/employees/lib/api-scope";
import { getEmployeeEditDetail, getUserProfileEditDetail } from "@/modules/employees/services/employee-edit-detail";
import { EmployeesPageWorkspace } from "@/modules/employees/ui/employees-page-workspace";

export const revalidate = 0;

export default async function PortalEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; employeeId?: string; profileId?: string; status?: string; message?: string }>;
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
  const isEditAction = action === "edit" || action === "edit-employee" || action === "edit-user";
  const openEmployeeModal = action === "create" || isEditAction;
  const initialModalMode = isEditAction ? "edit" : "create";

  let initialEmployee: NonNullable<Awaited<ReturnType<typeof getEmployeeEditDetail>>> | undefined;
  if (isEditAction) {
    const supabase = await createSupabaseServerClient();
    const { data: authData } = await supabase.auth.getUser();
    const scopeIds = authData.user ? await resolveHrScope(tenant.organizationId, authData.user.id) : null;

    if ((action === "edit" || action === "edit-employee") && params.employeeId) {
      initialEmployee = await getEmployeeEditDetail(tenant.organizationId, params.employeeId, { allowedBranchIds: scopeIds }) ?? undefined;
    } else if (action === "edit-user" && params.profileId) {
      initialEmployee = await getUserProfileEditDetail(tenant.organizationId, params.profileId, { allowedBranchIds: scopeIds }) ?? undefined;
    }
  }

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
      initialEmployee={initialEmployee}
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
