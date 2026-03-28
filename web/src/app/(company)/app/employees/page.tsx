import Link from "next/link";
import { Plus } from "lucide-react";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { EmployeesTableWorkspace } from "@/modules/employees/ui/employees-table-workspace";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";
import dynamicImport from "next/dynamic";

const NewEmployeeModal = dynamicImport(
  () => import("@/modules/employees/ui/new-employee-modal").then((mod) => mod.NewEmployeeModal)
);


type CompanyEmployeesPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; employeeId?: string; profileId?: string; limit?: string; page?: string }>;
};

const DARK_CARD = "[.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_PRIMARY = "[.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:text-white [.theme-dark-pro_&]:hover:bg-[#3a73c6]";

type DirectoryMembershipUser = {
  membershipId: string;
  userId: string;
  fullName: string;
  email: string;
  roleCode: string;
  status: string;
  branchId: string | null;
  branchName: string;
  createdAt: string;
};

export const revalidate = 0;

export default async function CompanyEmployeesPage({ searchParams }: CompanyEmployeesPageProps) {
  const tenant = await requireTenantModule("employees");
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const action = String(params.action ?? "").trim().toLowerCase();
  const openEmployeeModal = action === "create" || action === "edit" || action === "create-employee" || action === "edit-employee" || action === "edit-user";

  const editEmployeeId = (await searchParams).employeeId;
  const editProfileId = (await searchParams).profileId;
  const statusParam = params.status;
  const messageParam = params.message;

  const pageLimit = params.limit ? parseInt(params.limit, 10) : 100; const pageNumber = params.page ? parseInt(params.page, 10) : 1; const offset = Math.max(0, (pageNumber - 1) * pageLimit);
  
  const viewData = await getEmployeeDirectoryView(
    tenant.organizationId, 
    pageLimit, 
    offset,
    {
      includeModalsData: openEmployeeModal,
      includeUsersTab: true,
    }
  );

  const { data: organizationUserProfiles } = await supabase
    .from("organization_user_profiles")
    .select("id, user_id, first_name, last_name, email, phone, branch_id, department_id, is_employee, status, created_at")
    .eq("organization_id", tenant.organizationId)
    .eq("is_employee", false)
    .order("created_at", { ascending: false })
    .limit(pageLimit * 2);

  const { data: organizationMemberships } = await supabase
    .from("memberships")
    .select("user_id, status")
    .eq("organization_id", tenant.organizationId);

  const activeMembershipUserIds = new Set(
    (organizationMemberships ?? [])
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.user_id),
  );

  const { data: authData } = await supabase.auth.getUser();

  const publisherName = extractDisplayName(authData.user);

  const editEmployee = (action === "edit" || action === "edit-employee") && editEmployeeId
    ? viewData.employees.find((item) => item.id === editEmployeeId)
    : null;
  const editContract = editEmployee ? (editEmployee.contracts?.[0] ?? null) : null;
  const editUserProfile = action === "edit-user" && editProfileId
    ? (organizationUserProfiles ?? []).find((item) => item.id === editProfileId)
    : null;

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
        document_type: editEmployee.documentType ?? null,
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
        has_dashboard_access: Boolean(editEmployee.userId && activeMembershipUserIds.has(editEmployee.userId)),
      }
    : editUserProfile
      ? {
          id: "",
          organization_user_profile_id: editUserProfile.id,
          first_name: editUserProfile.first_name ?? "",
          last_name: editUserProfile.last_name ?? "",
          birth_date: null,
          sex: null,
          nationality: null,
          phone_country_code: null,
          phone: editUserProfile.phone ?? null,
          email: editUserProfile.email ?? "",
          personal_email: null,
          document_type: null,
          document_number: null,
          address: null,
          branch_id: editUserProfile.branch_id ?? "",
          position: "",
          position_id: "",
          department_id: editUserProfile.department_id ?? "",
          status: "active",
          hire_date: null,
          contract_type: null,
          contract_status: null,
          contract_start_date: null,
          contract_end_date: null,
          contract_notes: null,
          contract_signer_name: null,
          contract_signed_at: null,
          salary_amount: null,
          payment_frequency: null,
          salary_currency: null,
          has_dashboard_access: Boolean(editUserProfile.user_id && activeMembershipUserIds.has(editUserProfile.user_id)),
        }
    : undefined;

  const branchNameById = new Map((viewData.branches ?? []).map((b) => [b.id, b.name]));
  const departmentNameById = new Map((viewData.departments ?? []).map((d) => [d.id, d.name]));
  const membershipByUser = new Map<string, DirectoryMembershipUser>(
    ((viewData.users ?? []) as DirectoryMembershipUser[]).map((u) => [u.userId, u]),
  );

  const employeeRows = viewData.employees.map((emp) => {
    const defaultContract = emp.contracts?.[0];
    return {
      recordType: "employee" as const,
      id: emp.id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      email: emp.email,
      phone: emp.phone,
      position: emp.position,
      status: emp.status,
      dashboardAccess: Boolean(emp.userId && activeMembershipUserIds.has(emp.userId)),
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
      organizationUserProfileId: null,
    };
  });

  const userRows = (organizationUserProfiles ?? []).map((profile) => {
    const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
    const membership = profile.user_id ? membershipByUser.get(profile.user_id) : null;

    return {
      recordType: "user" as const,
      id: `user-profile-${profile.id}`,
      membershipId: membership?.membershipId ?? null,
      roleCode: membership?.roleCode ?? "employee",
      branchId: profile.branch_id ?? null,
      firstName: profile.first_name ?? (fullName || "Usuario"),
      lastName: profile.last_name ?? "",
      email: profile.email,
      phone: profile.phone,
      position: null,
      status: profile.status ?? "inactive",
      dashboardAccess: Boolean(profile.user_id && activeMembershipUserIds.has(profile.user_id)),
      hiredAt: null,
      branchName: profile.branch_id ? (branchNameById.get(profile.branch_id) ?? "Sin locacion") : "Sin locacion",
      departmentName: profile.department_id ? (departmentNameById.get(profile.department_id) ?? "Sin departamento") : "Sin departamento",
      salaryAmount: null,
      salaryCurrency: null,
      paymentFrequency: null,
      contractStatus: null,
      contractSignedAt: null,
      birthDate: null,
      sex: null,
      nationality: null,
      addressLine1: null,
      addressCity: null,
      addressState: null,
      addressCountry: null,
      emergencyName: null,
      emergencyPhone: null,
      emergencyEmail: null,
      pendingDocuments: 0,
      organizationUserProfileId: profile.id,
    };
  });

  const directoryRows = [...employeeRows, ...userRows];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className={`rounded-2xl border border-[#e5ddd8] bg-[#fffdfa] p-6 ${DARK_CARD}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={`mb-2 text-xs font-semibold tracking-[0.12em] text-[#9c938d] uppercase ${DARK_MUTED}`}>Recursos Humanos</p>
            <h1 className={`mb-1 text-2xl font-bold tracking-tight text-[#241f1c] ${DARK_TEXT}`}>Usuarios / Empleados</h1>
            <p className={`text-sm text-[#6b635e] ${DARK_MUTED}`}>Crea usuarios con o sin perfil de empleado y gestiona su estado laboral. El acceso a la plataforma se controla por separado.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/employees?action=create" className={`inline-flex items-center gap-1 rounded-lg bg-[#111111] px-3 py-2 text-sm font-semibold text-white hover:bg-[#c0392b] ${DARK_PRIMARY}`}><Plus className="h-4 w-4" /> Nuevo Usuario / Empleado</Link>
          </div>
        </div>
      </section>

      {messageParam ? (
        <section className={`rounded-xl border px-4 py-3 text-sm ${statusParam === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {messageParam}
        </section>
      ) : null}

      <EmployeesTableWorkspace employees={directoryRows} />

      {openEmployeeModal && (
        <NewEmployeeModal
          key={initialEmployeeData?.id || initialEmployeeData?.organization_user_profile_id || "new"}
          open={true}
          mode={(action === "edit" || action === "edit-employee" || action === "edit-user") ? "edit" : "create"}
          initialEmployee={initialEmployeeData}
          branches={viewData.branches}
          recentDocuments={viewData.documents}
          departments={viewData.departments}
          positions={viewData.positions}
          publisherName={publisherName}
        />
      )}
    </main>
  );
}
