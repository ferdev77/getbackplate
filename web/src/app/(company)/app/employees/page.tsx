import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createUserAccountAction } from "@/modules/employees/actions";
import { EmployeesTableWorkspace } from "@/modules/employees/ui/employees-table-workspace";
import { NewEmployeeModal } from "@/modules/employees/ui/new-employee-modal";
import { NewUserModal } from "@/modules/employees/ui/new-user-modal";
import { UserDepartmentPositionFields } from "@/modules/employees/ui/user-department-position-fields";
import { UsersTableWorkspace } from "@/modules/employees/ui/users-table-workspace";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";

type CompanyEmployeesPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; tab?: string; employeeId?: string; limit?: string }>;
};

const ROLE_OPTIONS = [
  { value: "employee", label: "Empleado" },
  { value: "manager", label: "Manager" },
  { value: "company_admin", label: "Administrador" },
];

export default async function CompanyEmployeesPage({ searchParams }: CompanyEmployeesPageProps) {
  const tenant = await requireTenantModule("employees");
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const tab = params.tab === "users" ? "users" : "employees";
  const limitStr = params.limit as string | undefined;
  const pageLimit = limitStr ? parseInt(limitStr, 10) : 1000;

  const viewData = await getEmployeeDirectoryView(supabase, tenant.organizationId, pageLimit);

  let allowedBranches = viewData.branches;
  if (tenant.roleCode === "manager" && tenant.branchId) {
    allowedBranches = allowedBranches.filter((b) => b.id === tenant.branchId);
  }

  const admin = createSupabaseAdminClient();
  const { data: organization } = await admin
    .from("organizations")
    .select("plan_id")
    .eq("id", tenant.organizationId)
    .single();

  const { data: currentPlan } = organization?.plan_id
    ? await admin
        .from("plans")
        .select("max_employees, max_users")
        .eq("id", organization.plan_id)
        .single()
    : { data: null };

  const currentUsersCount = viewData.users.filter((u: any) => u.status === "active").length;
  const currentEmployeesCount = viewData.employees.filter((e: any) => e.status === "active").length;

  const usersLimitReached = currentPlan?.max_users ? currentUsersCount >= currentPlan.max_users : false;
  const employeesLimitReached = currentPlan?.max_employees
    ? currentEmployeesCount >= currentPlan.max_employees
    : false;

  const editEmployee = params.action === "edit"
    ? viewData.employees.find((item) => item.id === params.employeeId)
    : null;
  const openEmployeeModal = params.action === "create" || (params.action === "edit" && Boolean(editEmployee));
  const editContract = editEmployee ? (editEmployee.contracts?.[0] ?? null) : null;

  const { data: authData } = await supabase.auth.getUser();
  const publisherName = extractDisplayName(authData.user);

  const initialEmployeeData = editEmployee
    ? {
        id: editEmployee.id,
        first_name: editEmployee.firstName,
        last_name: editEmployee.lastName,
        birth_date: editEmployee.birthDate,
        sex: editEmployee.sex,
        nationality: editEmployee.nationality,
        phone_country_code: editEmployee.phoneCountryCode,
        phone: editEmployee.phone,
        email: editEmployee.email,
        personal_email: editEmployee.personalEmail,
        document_id: editEmployee.documentId,
        document_number: editEmployee.documentNumber,
        address: editEmployee.addressLine1,
        branch_id: editEmployee.branchId ?? "",
        position: editEmployee.position,
        position_id: editEmployee.departmentId && editEmployee.position 
            ? (viewData.positions.find(p => p.department_id === editEmployee.departmentId && p.name.toLowerCase() === editEmployee.position?.toLowerCase())?.id ?? "")
            : "",
        department_id: editEmployee.departmentId ?? "",
        status: editEmployee.status,
        hire_date: editEmployee.hiredAt,
        contract_type: editContract?.contract_type ?? null,
        contract_status: editContract?.contract_status ?? null,
        contract_start_date: editContract?.start_date ?? null,
        contract_end_date: editContract?.end_date ?? null,
        contract_notes: editContract?.notes ?? null,
        contract_signer_name: editContract?.signer_name ?? null,
        contract_signed_at: editContract?.signed_at ?? null,
        salary_amount: editContract?.salary_amount ?? null,
        payment_frequency: editContract?.payment_frequency ?? null,
        salary_currency: editContract?.salary_currency ?? null,
      }
    : undefined;
  const openUserModal = params.action === "create-user";

  const employeeRows = viewData.employees.map((emp) => {
    const defaultContract = emp.contracts?.[0];
    return {
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      position: emp.position,
      status: emp.status,
      hiredAt: emp.hiredAt,
      branchName: emp.branchName,
      departmentName: (emp.departmentId ? viewData.departments.find(d => d.id === emp.departmentId)?.name : null) ?? emp.department ?? "Sin departamento",
      salaryAmount: defaultContract?.salary_amount ?? null,
      salaryCurrency: defaultContract?.salary_currency ?? null,
      paymentFrequency: defaultContract?.payment_frequency ?? null,
      contractStatus: defaultContract?.contract_status ?? null,
      contractSignedAt: defaultContract?.signed_at ?? null,
      birthDate: emp.birthDate,
      sex: emp.sex,
      nationality: emp.nationality,
      addressLine1: emp.addressLine1,
      addressCity: emp.addressCity,
      addressState: emp.addressState,
      addressCountry: emp.addressCountry,
      emergencyName: emp.emergencyContactName,
      emergencyPhone: emp.emergencyContactPhone,
      emergencyEmail: emp.emergencyContactEmail,
      pendingDocuments: emp.pendingDocuments?.length ?? 0,
    };
  });

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-semibold tracking-[0.12em] text-[#9c938d] uppercase">Recursos Humanos</p>
            <h1 className="mb-1 text-2xl font-bold tracking-tight text-[#241f1c]">Empleados</h1>
            <p className="text-sm text-[#6b635e]">Gestion de plantilla, cuentas y estado laboral.</p>
            <div className="mt-3 inline-flex rounded-lg border border-[#e5ddd8] bg-white p-1 text-xs">
              <Link href="/app/employees" className={`rounded-md px-3 py-1.5 ${tab === "employees" ? "bg-[#111] text-white" : "text-[#5f5853]"}`}>Empleados</Link>
              <Link href="/app/employees?tab=users" className={`rounded-md px-3 py-1.5 ${tab === "users" ? "bg-[#111] text-white" : "text-[#5f5853]"}`}>Usuarios</Link>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/app/employees?action=create-user" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-sm text-[#4f4843] hover:bg-[#f7f3f1]"><UserPlus className="h-4 w-4" /> Nuevo Usuario</Link>
            <Link href="/app/employees?action=create" className="inline-flex items-center gap-1 rounded-lg bg-[#111111] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c0392b]"><Plus className="h-4 w-4" /> Nuevo Empleado</Link>
          </div>
        </div>
      </section>

      {params.message ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${params.status === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {params.message}
        </section>
      ) : null}

      {tab === "employees" ? (
        <EmployeesTableWorkspace employees={employeeRows} />
      ) : (
        <UsersTableWorkspace
          users={viewData.users}
          roleOptions={ROLE_OPTIONS}
          branchOptions={viewData.branches.map((branch) => ({ id: branch.id, name: branch.name }))}
        />
      )}

      <NewEmployeeModal
        open={openEmployeeModal}
        mode={params.action === "edit" ? "edit" : "create"}
        initialEmployee={initialEmployeeData}
        branches={viewData.branches}
        recentDocuments={viewData.documents}
        departments={viewData.departments}
        positions={viewData.positions}
        publisherName={publisherName}
      />

      <NewUserModal
        open={openUserModal}
        branches={viewData.branches}
        roleOptions={ROLE_OPTIONS}
        departments={viewData.departments}
        positions={viewData.positions}
      />
    </main>
  );
}
