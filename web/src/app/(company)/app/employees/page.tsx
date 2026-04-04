import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { EmployeesPageWorkspace } from "@/modules/employees/ui/employees-page-workspace";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";


type CompanyEmployeesPageProps = {
  searchParams: Promise<{ status?: string; message?: string; action?: string; employeeId?: string; profileId?: string; limit?: string; page?: string }>;
};

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

type EmployeeDocumentSlot = {
  documentId: string;
  title: string;
  status: string;
};

const EMPLOYEE_DOCUMENT_SLOT_RULES: Array<{ slot: string; prefix: string }> = [
  { slot: "photo", prefix: "Foto del Empleado - " },
  { slot: "id", prefix: "ID / Identificacion - " },
  { slot: "ssn", prefix: "Numero de Seguro Social - " },
  { slot: "rec1", prefix: "Food Handler Certificate - " },
  { slot: "rec2", prefix: "Alcohol Server Certificate - " },
  { slot: "other", prefix: "Food Protection Manager - " },
  { slot: "rec1", prefix: "Carta de Recomendacion 1 - " },
  { slot: "rec2", prefix: "Carta de Recomendacion 2 - " },
  { slot: "other", prefix: "Otro Documento - " },
];

function resolveDocumentSlotFromTitle(title: string | null | undefined) {
  if (!title) return null;
  return EMPLOYEE_DOCUMENT_SLOT_RULES.find((rule) => title.startsWith(rule.prefix))?.slot ?? null;
}

export const revalidate = 0;

export default async function CompanyEmployeesPage({ searchParams }: CompanyEmployeesPageProps) {
  const tenant = await requireTenantModule("employees");
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const action = String(params.action ?? "").trim().toLowerCase();
  const isEditAction = action === "edit" || action === "edit-employee" || action === "edit-user";
  const openEmployeeModal = action === "create" || action === "edit" || action === "create-employee" || action === "edit-employee" || action === "edit-user";

  const editEmployeeId = params.employeeId;
  const editProfileId = params.profileId;
  const statusParam = params.status;
  const messageParam = params.message;

  const pageLimit = params.limit ? parseInt(params.limit, 10) : 100; const pageNumber = params.page ? parseInt(params.page, 10) : 1; const offset = Math.max(0, (pageNumber - 1) * pageLimit);
  
  const viewData = await getEmployeeDirectoryView(
    tenant.organizationId, 
    pageLimit, 
    offset,
    {
      includeModalsData: isEditAction,
      includeUsersTab: true,
    }
  );

  const [{ data: departmentsData }, { data: positionsData }] = await Promise.all([
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
  ]);

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

  const profileUserIds = Array.from(
    new Set((organizationUserProfiles ?? []).map((profile) => profile.user_id).filter(Boolean)),
  ) as string[];

  const userDocumentsCountByUserId = new Map<string, number>();

  if (profileUserIds.length > 0) {
    const { data: profileScopedDocuments } = await supabase
      .from("documents")
      .select("id, title, access_scope")
      .eq("organization_id", tenant.organizationId)
      .is("deleted_at", null)
      .or([
        "title.ilike.Foto del Empleado - %",
        "title.ilike.ID / Identificacion - %",
        "title.ilike.Numero de Seguro Social - %",
        "title.ilike.Food Handler Certificate - %",
        "title.ilike.Alcohol Server Certificate - %",
        "title.ilike.Food Protection Manager - %",
        "title.ilike.Carta de Recomendacion 1 - %",
        "title.ilike.Carta de Recomendacion 2 - %",
        "title.ilike.Otro Documento - %",
      ].join(","));

    const docIdsByUser = new Map<string, Set<string>>();

    for (const row of profileScopedDocuments ?? []) {
      const title = typeof row.title === "string" ? row.title : null;
      const slot = resolveDocumentSlotFromTitle(title);
      if (!slot) continue;

      const accessScope = row.access_scope as { users?: unknown } | null;
      const users = Array.isArray(accessScope?.users)
        ? (accessScope?.users.filter((value): value is string => typeof value === "string") ?? [])
        : [];

      for (const userId of users) {
        if (!profileUserIds.includes(userId)) continue;
        if (!docIdsByUser.has(userId)) {
          docIdsByUser.set(userId, new Set<string>());
        }
        docIdsByUser.get(userId)!.add(row.id);
      }
    }

    for (const userId of profileUserIds) {
      userDocumentsCountByUserId.set(userId, docIdsByUser.get(userId)?.size ?? 0);
    }
  }

  const { data: authData } = await supabase.auth.getUser();
  const { data: organizationRow } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", tenant.organizationId)
    .maybeSingle();
  const organizationName = organizationRow?.name ?? "la empresa";

  const publisherName = extractDisplayName(authData.user);

  const editEmployee = (action === "edit" || action === "edit-employee") && editEmployeeId
    ? viewData.employees.find((item) => item.id === editEmployeeId)
    : null;
  const editContract = editEmployee ? (editEmployee.contracts?.[0] ?? null) : null;

  const editEmployeeDocuments = editEmployee
    ? await supabase
        .from("employee_documents")
        .select("document_id, status, linked_document:documents(id, title)")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", editEmployee.id)
    : { data: [] as unknown[] };

  const editEmployeeDocumentsBySlot: Record<string, EmployeeDocumentSlot> = {};
  for (const row of (editEmployeeDocuments.data ?? []) as Array<{
    document_id: string;
    status: string;
    linked_document: { id?: string; title?: string }[] | { id?: string; title?: string } | null;
  }>) {
    const linked = Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document;
    const title = typeof linked?.title === "string" ? linked.title : "";
    const slot = EMPLOYEE_DOCUMENT_SLOT_RULES.find((rule) => title.startsWith(rule.prefix))?.slot;
    if (!slot) continue;
    editEmployeeDocumentsBySlot[slot] = {
      documentId: row.document_id,
      title,
      status: row.status,
    };
  }

  const editUserProfile = action === "edit-user" && editProfileId
    ? (organizationUserProfiles ?? []).find((item) => item.id === editProfileId)
    : null;

  let editUserDocumentsBySlot: Record<string, EmployeeDocumentSlot> = {};
  if (editUserProfile?.user_id) {
    const { data: userScopedDocuments } = await supabase
      .from("documents")
      .select("id, title, access_scope")
      .eq("organization_id", tenant.organizationId)
      .is("deleted_at", null)
      .or([
        "title.ilike.Foto del Empleado - %",
        "title.ilike.ID / Identificacion - %",
        "title.ilike.Numero de Seguro Social - %",
        "title.ilike.Food Handler Certificate - %",
        "title.ilike.Alcohol Server Certificate - %",
        "title.ilike.Food Protection Manager - %",
        "title.ilike.Carta de Recomendacion 1 - %",
        "title.ilike.Carta de Recomendacion 2 - %",
        "title.ilike.Otro Documento - %",
      ].join(","));

    const filteredRows = (userScopedDocuments ?? []).filter((row) => {
      const scope = row.access_scope as { users?: unknown } | null;
      const users = Array.isArray(scope?.users)
        ? scope.users.filter((value): value is string => typeof value === "string")
        : [];
      return users.includes(editUserProfile.user_id as string);
    });

    editUserDocumentsBySlot = {};
    for (const row of filteredRows) {
      const slot = resolveDocumentSlotFromTitle(typeof row.title === "string" ? row.title : null);
      if (!slot) continue;
      editUserDocumentsBySlot[slot] = {
        documentId: row.id,
        title: row.title,
        status: "uploaded",
      };
    }
  }

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
        documents_by_slot: editEmployeeDocumentsBySlot,
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
          documents_by_slot: editUserDocumentsBySlot,
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
      branchName: emp.branchName ?? "Sin locacion",
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
      pendingDocuments: typeof emp.pendingDocuments === "number" ? emp.pendingDocuments : 0,
      docsCompletionStatus: (emp.documentsCompletionStatus === "complete" ? "complete" : "incomplete") as
        | "complete"
        | "incomplete",
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
      docsCompletionStatus: "incomplete" as const,
      docsUploadedCount: profile.user_id ? (userDocumentsCountByUserId.get(profile.user_id) ?? 0) : 0,
      organizationUserProfileId: profile.id,
    };
  });

  const directoryRows = [...employeeRows, ...userRows];

  return (
    <EmployeesPageWorkspace
      statusParam={statusParam}
      messageParam={messageParam}
      employees={directoryRows}
      branches={viewData.branches}
      departments={departmentsData ?? []}
      positions={positionsData ?? []}
      publisherName={publisherName}
      companyName={organizationName}
      initialModalOpen={openEmployeeModal}
      initialModalMode={isEditAction ? "edit" : "create"}
      initialEmployee={initialEmployeeData}
    />
  );
}
