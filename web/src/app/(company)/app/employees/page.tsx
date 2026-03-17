import Link from "next/link";
import { Plus } from "lucide-react";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { EmployeesTableWorkspace } from "@/modules/employees/ui/employees-table-workspace";
import { NewEmployeeModal } from "@/modules/employees/ui/new-employee-modal";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";


type CompanyEmployeesPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; employeeId?: string; limit?: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CompanyEmployeesPage({ searchParams }: CompanyEmployeesPageProps) {
  const tenant = await requireTenantModule("employees");
  // Use server client only to get auth user; use admin client for data queries to bypass RLS
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const action = String((await searchParams).action ?? "").trim().toLowerCase();
  const openEmployeeModal = action === "create" || action === "edit" || action === "create-employee" || action === "edit-employee";

  const editEmployeeId = (await searchParams).employeeId;
  const statusParam = (await searchParams).status;
  const messageParam = (await searchParams).message;

  const pageLimit = 100;
  
  // Use admin client to bypass RLS — this is a server-side page with tenant auth already verified
  const viewData = await getEmployeeDirectoryView(
    admin, 
    tenant.organizationId, 
    pageLimit,
    {
      includeModalsData: openEmployeeModal,
      includeUsersTab: false
    }
  );

  const { data: authData } = await supabase.auth.getUser();
  let allowedBranches = viewData.branches;
  if (tenant.roleCode === "manager" && tenant.branchId) {
    allowedBranches = allowedBranches.filter((b) => b.id === tenant.branchId);
  }

  const { data: organization } = await admin
    .from("organizations")
    .select("plan_id")
    .eq("id", tenant.organizationId)
    .single();

  const { data: currentPlan } = organization?.plan_id
    ? await admin
        .from("plans")
        .select("max_employees")
        .eq("id", organization.plan_id)
        .single()
    : { data: null };

  const publisherName = extractDisplayName(authData.user);

  const editEmployee = (action === "edit" || action === "edit-employee") && editEmployeeId
    ? viewData.employees.find((item) => item.id === editEmployeeId)
    : null;
  const editContract = editEmployee ? (editEmployee.contracts?.[0] ?? null) : null;

  const initialEmployeeData = editEmployee
    ? {
        id: editEmployee.id,
        first_name: editEmployee.firstName ?? "",
        last_name: editEmployee.lastName ?? "",
        birth_date: editEmployee.birthDate ?? null,
        sex: editEmployee.sex ?? null,
        nationality: editEmployee.nationality ?? null,
        phone_country_code: editEmployee.phoneCountryCode ?? null,
        phone: editEmployee.phone ?? null,
        email: editEmployee.email ?? "",
        personal_email: editEmployee.personalEmail ?? null,
        document_id: editEmployee.documentId ?? null,
        document_number: editEmployee.documentNumber ?? null,
        address: editEmployee.addressLine1 ?? null,
        branch_id: editEmployee.branchId ?? "",
        position: editEmployee.position ?? "",
        position_id: editEmployee.positionId ?? "",
        department_id: editEmployee.departmentId ?? "",
        status: editEmployee.status ?? "",
        hire_date: editEmployee.hiredAt ?? null,
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
      departmentName: emp.department ?? "Sin departamento",
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
            <p className="text-sm text-[#6b635e]">Gestión de plantilla y estado laboral.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/employees?action=create" className="inline-flex items-center gap-1 rounded-lg bg-[#111111] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c0392b]"><Plus className="h-4 w-4" /> Nuevo Empleado</Link>
          </div>
        </div>
      </section>

      {messageParam ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${statusParam === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {messageParam}
        </section>
      ) : null}

      <EmployeesTableWorkspace employees={employeeRows} />

      <NewEmployeeModal
        open={openEmployeeModal}
        mode={(action === "edit" || action === "edit-employee") ? "edit" : "create"}
        initialEmployee={initialEmployeeData}
        branches={viewData.branches}
        recentDocuments={viewData.documents}
        departments={viewData.departments}
        positions={viewData.positions}
        publisherName={publisherName}
      />
    </main>
  );
}
