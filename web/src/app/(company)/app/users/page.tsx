import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { UsersPageWorkspace } from "@/modules/employees/ui/users-page-workspace";


type CompanyUsersPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; limit?: string }>;
};

const ROLE_OPTIONS = [
  { value: "company_admin", label: "Administrador" },
];


export const revalidate = 0;

export default async function CompanyUsersPage({ searchParams }: CompanyUsersPageProps) {
  const tenant = await requireTenantModule("employees");
  const params = await searchParams;
  const action = String(params.action ?? "").trim().toLowerCase();
  const openUserModal = action === "create-user" || action === "edit-user";

  const statusParam = params.status;
  const messageParam = params.message;

  const viewData = await getEmployeeDirectoryView(
    tenant.organizationId, 
    100,
    0,
    {
      includeEmployeesData: false,
      includeUsersTab: true,
    }
  );

  return (
    <UsersPageWorkspace
      users={viewData.users}
      roleOptions={ROLE_OPTIONS}
      branchOptions={viewData.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      statusParam={statusParam}
      messageParam={messageParam}
      initialModalOpen={openUserModal}
    />
  );
}
