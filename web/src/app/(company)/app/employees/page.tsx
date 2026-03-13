import Link from "next/link";
import { Plus, UserPlus } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createUserAccountAction } from "@/modules/employees/actions";
import { EmployeesTableWorkspace } from "@/modules/employees/ui/employees-table-workspace";
import { NewEmployeeModal } from "@/modules/employees/ui/new-employee-modal";
import { UserDepartmentPositionFields } from "@/modules/employees/ui/user-department-position-fields";
import { UsersTableWorkspace } from "@/modules/employees/ui/users-table-workspace";
import { requireTenantModule } from "@/shared/lib/access";

type CompanyEmployeesPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; tab?: string; employeeId?: string }>;
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

  const [{ data: employees }, { data: branches }, { data: memberships }, { data: roles }, { data: documents }, { data: departments }, { data: positions }, { data: contracts }, { data: employeeDocs }] = await Promise.all([
    supabase
      .from("employees")
      .select("id, user_id, first_name, last_name, email, phone, phone_country_code, position, department, department_id, status, branch_id, hired_at, birth_date, sex, nationality, address_line1, address_city, address_state, address_postal_code, address_country, emergency_contact_name, emergency_contact_phone, emergency_contact_email, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .rpc("get_company_users", { lookup_organization_id: tenant.organizationId })
      .limit(100),
    supabase
      .from("roles")
      .select("id, code"),
    supabase
      .from("documents")
      .select("id, title, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name, is_active")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("employee_contracts")
      .select("employee_id, contract_type, contract_status, start_date, end_date, notes, signer_name, salary_amount, salary_currency, payment_frequency, signed_at, created_at")
      .eq("organization_id", tenant.organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("employee_documents")
      .select("employee_id, document_id, status")
      .eq("organization_id", tenant.organizationId),
  ]);

  const roleById = new Map((roles ?? []).map((row) => [row.id, row.code]));
  const branchById = new Map((branches ?? []).map((row) => [row.id, row.name]));
  const departmentById = new Map((departments ?? []).map((row) => [row.id, row.name]));
  const positionIdByDepartmentAndName = new Map<string, string>();
  for (const position of positions ?? []) {
    positionIdByDepartmentAndName.set(`${position.department_id}::${position.name.toLowerCase()}`, position.id);
  }
  const employeeByUserId = new Map(
    (employees ?? [])
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, `${row.first_name} ${row.last_name}`]),
  );

  const admin = createSupabaseAdminClient();

  const latestContractByEmployee = new Map<
    string,
    {
      contract_status: string;
      contract_type: string | null;
      start_date: string | null;
      end_date: string | null;
      notes: string | null;
      signer_name: string | null;
      salary_amount: number | null;
      salary_currency: string | null;
      payment_frequency: string | null;
      signed_at: string | null;
    }
  >();
  for (const row of contracts ?? []) {
    if (!latestContractByEmployee.has(row.employee_id)) {
      latestContractByEmployee.set(row.employee_id, {
        contract_status: row.contract_status,
        contract_type: row.contract_type,
        start_date: row.start_date,
        end_date: row.end_date,
        notes: row.notes,
        signer_name: row.signer_name,
        salary_amount: row.salary_amount,
        salary_currency: row.salary_currency,
        payment_frequency: row.payment_frequency,
        signed_at: row.signed_at,
      });
    }
  }

  const pendingDocsByEmployee = new Map<string, number>();
  const linkedDocsByEmployee = new Map<string, string[]>();
  for (const row of employeeDocs ?? []) {
    const list = linkedDocsByEmployee.get(row.employee_id) ?? [];
    list.push(row.document_id);
    linkedDocsByEmployee.set(row.employee_id, list);

    if (row.status === "pending") {
      pendingDocsByEmployee.set(row.employee_id, (pendingDocsByEmployee.get(row.employee_id) ?? 0) + 1);
    }
  }

  const employeeRows = (employees ?? []).map((emp) => {
    const contract = latestContractByEmployee.get(emp.id);
    return {
      id: emp.id,
      firstName: emp.first_name,
      lastName: emp.last_name,
      email: emp.email,
      phone: emp.phone,
      position: emp.position,
      status: emp.status,
      hiredAt: emp.hired_at,
      branchName: emp.branch_id ? branchById.get(emp.branch_id) ?? "Sucursal" : "Global",
      departmentName: (emp.department_id ? departmentById.get(emp.department_id) : null) ?? emp.department ?? "Sin departamento",
      salaryAmount: contract?.salary_amount ?? null,
      salaryCurrency: contract?.salary_currency ?? null,
      paymentFrequency: contract?.payment_frequency ?? null,
      contractStatus: contract?.contract_status ?? null,
      contractSignedAt: contract?.signed_at ?? null,
      birthDate: emp.birth_date,
      sex: emp.sex,
      nationality: emp.nationality,
      addressLine1: emp.address_line1,
      addressCity: emp.address_city,
      addressState: emp.address_state,
      addressCountry: emp.address_country,
      emergencyName: emp.emergency_contact_name,
      emergencyPhone: emp.emergency_contact_phone,
      emergencyEmail: emp.emergency_contact_email,
      pendingDocuments: pendingDocsByEmployee.get(emp.id) ?? 0,
    };
  });

  const userRows = (memberships ?? []).map((member: any) => {
    return {
      membershipId: member.id,
      userId: member.user_id,
      fullName: employeeByUserId.get(member.user_id) ?? member.full_name ?? "Usuario",
      email: member.email || "",
      roleCode: roleById.get(member.role_id) ?? "employee",
      status: member.status,
      branchId: member.branch_id,
      branchName: member.branch_id ? branchById.get(member.branch_id) ?? "Sucursal" : "Todas",
      createdAt: member.created_at,
    };
  });

  const editEmployee = params.action === "edit"
    ? (employees ?? []).find((item) => item.id === params.employeeId)
    : null;
  const openEmployeeModal = params.action === "create" || (params.action === "edit" && Boolean(editEmployee));
  const editContract = editEmployee ? latestContractByEmployee.get(editEmployee.id) : null;

  const initialEmployeeData = editEmployee
    ? {
        id: editEmployee.id,
        first_name: editEmployee.first_name,
        last_name: editEmployee.last_name,
        birth_date: editEmployee.birth_date,
        sex: editEmployee.sex,
        nationality: editEmployee.nationality,
        phone_country_code: editEmployee.phone_country_code,
        phone: editEmployee.phone,
        email: editEmployee.email,
        address_line1: editEmployee.address_line1,
        address_city: editEmployee.address_city,
        address_state: editEmployee.address_state,
        address_postal_code: editEmployee.address_postal_code,
        address_country: editEmployee.address_country,
        emergency_contact_name: editEmployee.emergency_contact_name,
        emergency_contact_phone: editEmployee.emergency_contact_phone,
        emergency_contact_email: editEmployee.emergency_contact_email,
        branch_id: editEmployee.branch_id,
        position: editEmployee.position,
        position_id:
          editEmployee.department_id && editEmployee.position
            ? positionIdByDepartmentAndName.get(`${editEmployee.department_id}::${editEmployee.position.toLowerCase()}`) ?? null
            : null,
        department_id: editEmployee.department_id,
        status: editEmployee.status,
        hired_at: editEmployee.hired_at,
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
        linked_document_ids: linkedDocsByEmployee.get(editEmployee.id) ?? [],
      }
    : undefined;
  const openUserModal = params.action === "create-user";

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
          users={userRows}
          roleOptions={ROLE_OPTIONS}
          branchOptions={(branches ?? []).map((branch) => ({ id: branch.id, name: branch.name }))}
        />
      )}

      <NewEmployeeModal
        open={openEmployeeModal}
        mode={params.action === "edit" ? "edit" : "create"}
        initialEmployee={initialEmployeeData}
        branches={branches ?? []}
        documents={documents ?? []}
        departments={departments ?? []}
        positions={positions ?? []}
      />

      {openUserModal ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
          <div className="max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
            <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
              <p className="font-serif text-[15px] font-bold text-[#111]">Nuevo Usuario</p>
              <Link href="/app/employees" className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link>
            </div>
            <form action={createUserAccountAction}>
              <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
                <label className="mb-1 mt-0 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Nombre completo</label>
                <input name="full_name" required className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm" placeholder="ej. Juan Garcia" />
                <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Correo corporativo</label>
                <input name="email" type="email" required className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm" placeholder="nombre@empresa.com" />
                <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Contrasena inicial</label>
                <input name="password" type="password" required className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm" placeholder="Minimo 8 caracteres" />
                <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Locacion</label>
                <select name="branch_id" defaultValue="" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
                  <option value="">Todas las locaciones</option>
                  {(branches ?? []).map((branch) => (<option key={branch.id} value={branch.id}>{branch.name}</option>))}
                </select>
                <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Puesto / Departamento</label>
                <select name="role_code" defaultValue="employee" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
                  {ROLE_OPTIONS.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                </select>
                <UserDepartmentPositionFields departments={departments ?? []} positions={positions ?? []} />
                <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Acceso de usuario</label>
                <select name="access_status" defaultValue="active" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
                  <option value="active">Activo</option>
                  <option value="inactivo">Inactivo</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
                <Link href="/app/employees" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cancelar</Link>
                <button className="rounded-lg bg-[#111] px-5 py-2 text-sm font-bold text-white hover:bg-[#c0392b]" type="submit">Crear Usuario</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
