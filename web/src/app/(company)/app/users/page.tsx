import Link from "next/link";
import { UserPlus } from "lucide-react";

import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { UsersTableWorkspace } from "@/modules/employees/ui/users-table-workspace";
import { NewUserModal } from "@/modules/employees/ui/new-user-modal";


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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Accesos</p>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">Administradores</h1>
            <p className="text-sm text-[var(--gbp-text2)]">Gestión de accesos administrativos, credenciales y permisos del sistema.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/users?action=create-user" className="inline-flex items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--gbp-accent-hover)]"><UserPlus className="h-4 w-4" /> Nuevo Administrador</Link>
          </div>
        </div>
      </section>

      {messageParam ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${statusParam === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {messageParam}
        </section>
      ) : null}

      <UsersTableWorkspace
        users={viewData.users}
        roleOptions={ROLE_OPTIONS}
        branchOptions={viewData.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
      />

      <NewUserModal
        open={openUserModal}
        branches={viewData.branches}
        roleOptions={ROLE_OPTIONS}
      />
    </main>
  );
}
