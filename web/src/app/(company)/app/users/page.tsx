import Link from "next/link";
import { UserPlus } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { UsersTableWorkspace } from "@/modules/employees/ui/users-table-workspace";
import { NewUserModal } from "@/modules/employees/ui/new-user-modal";


type CompanyUsersPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; limit?: string }>;
};

const DARK_CARD = "[.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_PRIMARY = "[.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:text-white [.theme-dark-pro_&]:hover:bg-[#3a73c6]";

const ROLE_OPTIONS = [
  { value: "company_admin", label: "Administrador" },
];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyUsersPage({ searchParams }: CompanyUsersPageProps) {
  const tenant = await requireTenantModule("employees");
  // Use admin client to bypass RLS — tenant auth is already verified via requireTenantModule
  const admin = createSupabaseAdminClient();
  const action = String((await searchParams).action ?? "").trim().toLowerCase();
  const openUserModal = action === "create-user" || action === "edit-user";

  const statusParam = (await searchParams).status;
  const messageParam = (await searchParams).message;

  const pageLimit = 50;
  
  const viewData = await getEmployeeDirectoryView(
    admin, 
    tenant.organizationId, 
    pageLimit,
    {
      includeModalsData: openUserModal,
      includeUsersTab: true
    }
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className={`rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6 ${DARK_CARD}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`mb-2 text-xs font-semibold tracking-[0.12em] text-[#9c938d] uppercase ${DARK_MUTED}`}>Accesos</p>
            <h1 className={`mb-1 text-2xl font-bold tracking-tight text-[#241f1c] ${DARK_TEXT}`}>Administradores</h1>
            <p className={`text-sm text-[#6b635e] ${DARK_MUTED}`}>Gestión de accesos administrativos, credenciales y permisos del sistema.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/users?action=create-user" className={`inline-flex items-center gap-1 rounded-lg bg-[#111111] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c0392b] ${DARK_PRIMARY}`}><UserPlus className="h-4 w-4" /> Nuevo Administrador</Link>
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
