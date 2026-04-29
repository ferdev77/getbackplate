import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { EmployeesPageWorkspace } from "@/modules/employees/ui/employees-page-workspace";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { requireTenantModule } from "@/shared/lib/access";
import { extractDisplayName } from "@/shared/lib/user";
import {
  EMPLOYEE_PERMISSION_MODULES,
  type EmployeePermissionModuleCode,
  getEmptyEmployeeDelegatedPermissions,
  normalizeEmployeeDelegatedPermissions,
} from "@/shared/lib/employee-module-permissions";


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
  requested_without_file?: boolean;
  uploaded_by_role?: "employee" | "company";
  uploaded_by_label?: string;
  review_comment?: string | null;
  expires_at?: string | null;
  reminder_days?: 15 | 30 | 45 | null;
  has_no_expiration?: boolean;
  expiration_configured?: boolean;
  signature_status?: "requested" | "viewed" | "completed" | "declined" | "expired" | "failed" | null;
  signature_embed_src?: string | null;
  signature_requested_at?: string | null;
  signature_completed_at?: string | null;
};

const EMPLOYEE_DOCUMENT_SLOT_RULES: Array<{ slot: string; prefix: string }> = [
  { slot: "photo", prefix: "Foto del Empleado - " },
  { slot: "id", prefix: "ID / Identificacion - " },
  { slot: "ssn", prefix: "SSN / EAD - " },
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

function isEmployeePermissionModuleCode(value: unknown): value is EmployeePermissionModuleCode {
  return typeof value === "string" && EMPLOYEE_PERMISSION_MODULES.includes(value as EmployeePermissionModuleCode);
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

  if (!isEditAction) {
    return (
      <EmployeesPageWorkspace
        statusParam={statusParam}
        messageParam={messageParam}
        employees={[]}
        branches={[]}
        departments={[]}
        positions={[]}
        publisherName=""
        companyName=""
        initialModalOpen={openEmployeeModal}
        initialModalMode="create"
        deferredDataUrl={`/api/company/employees?catalog=directory_page&limit=100&page=1`}
      />
    );
  }

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
    .select("id, user_id, first_name, last_name, email, phone, branch_id, all_locations, location_scope_ids, department_id, is_employee, status, created_at")
    .eq("organization_id", tenant.organizationId)
    .eq("is_employee", false)
    .order("created_at", { ascending: false })
    .limit(pageLimit * 2);

  const { data: organizationMemberships } = await supabase
    .from("memberships")
    .select("id, user_id, status")
    .eq("organization_id", tenant.organizationId);

  const activeMembershipUserIds = new Set(
    (organizationMemberships ?? [])
      .filter((membership) => membership.status === "active")
      .map((membership) => membership.user_id),
  );

  const membershipIdByUserId = new Map(
    (organizationMemberships ?? [])
      .filter((membership) => membership.user_id)
      .map((membership) => [membership.user_id as string, membership.id as string]),
  );

  const membershipIds = Array.from(
    new Set(
      (organizationMemberships ?? [])
        .map((membership) => membership.id)
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const { data: delegatedPermissionRows } = membershipIds.length
    ? await createSupabaseAdminClient()
        .from("employee_module_permissions")
        .select("membership_id, module_code, can_view, can_create, can_edit, can_delete")
        .eq("organization_id", tenant.organizationId)
        .in("membership_id", membershipIds)
    : { data: [] as Array<{ membership_id: string; module_code: string; can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean }> };

  const delegatedPermissionsByMembershipId = new Map<string, ReturnType<typeof getEmptyEmployeeDelegatedPermissions>>();
  for (const row of delegatedPermissionRows ?? []) {
    const current = delegatedPermissionsByMembershipId.get(row.membership_id) ?? getEmptyEmployeeDelegatedPermissions();
    const moduleCode = row.module_code;
    if (!isEmployeePermissionModuleCode(moduleCode)) continue;
    current[moduleCode] = {
      view: row.can_view === true,
      create: row.can_create === true,
      edit: row.can_edit === true,
      delete: row.can_delete === true,
    };
    if (moduleCode === "vendors" && (current[moduleCode].create || current[moduleCode].edit || current[moduleCode].delete)) {
      current[moduleCode].view = true;
    }
    delegatedPermissionsByMembershipId.set(row.membership_id, current);
  }

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
        "title.ilike.SSN / EAD - %",
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

  let editEmployeeDocuments = { data: [] as unknown[] };
  if (editEmployee) {
    const admin = createSupabaseAdminClient();
    const withComment = await admin
      .from("employee_documents")
      .select("document_id, status, requested_without_file, reviewed_by, review_comment, expires_at, reminder_days, has_no_expiration, signature_status, signature_embed_src, signature_requested_at, signature_completed_at, created_at, linked_document:documents(id, title, owner_user_id, mime_type, original_file_name, file_path)")
      .eq("organization_id", tenant.organizationId)
      .eq("employee_id", editEmployee.id)
      .order("created_at", { ascending: false });

    if (
      withComment.error &&
      ["review_comment", "expires_at", "reminder_days", "has_no_expiration", "signature_status", "signature_embed_src", "signature_requested_at", "signature_completed_at", "requested_without_file"].some((field) => String(withComment.error?.message ?? "").includes(field))
    ) {
      const fallback = await admin
        .from("employee_documents")
        .select("document_id, status, reviewed_by, created_at, linked_document:documents(id, title, owner_user_id, mime_type, original_file_name, file_path)")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", editEmployee.id)
        .order("created_at", { ascending: false });
      editEmployeeDocuments = { data: (fallback.data ?? []) as unknown[] };
    } else {
      editEmployeeDocuments = { data: (withComment.data ?? []) as unknown[] };
    }
  }

  const uploaderUserIds = Array.from(
    new Set(
      ((editEmployeeDocuments.data ?? []) as Array<{
        reviewed_by?: string | null;
        linked_document:
          | { owner_user_id?: string | null }[]
          | { owner_user_id?: string | null }
          | null;
      }>)
        .flatMap((row) => {
          const linked = Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document;
          return [linked?.owner_user_id ?? null, row.reviewed_by ?? null];
        })
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );

  const { data: uploaderProfiles } = uploaderUserIds.length > 0
    ? await createSupabaseAdminClient()
        .from("organization_user_profiles")
        .select("user_id, first_name, last_name, email")
        .eq("organization_id", tenant.organizationId)
        .in("user_id", uploaderUserIds)
    : { data: [] as Array<{ user_id: string; first_name: string | null; last_name: string | null; email: string | null }> };

  const uploaderLabelByUserId = new Map(
    (uploaderProfiles ?? []).map((row) => {
      const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      return [row.user_id, fullName || row.email || "Administrador"];
    }),
  );

  const unresolvedUploaderUserIds = uploaderUserIds.filter((userId) => !uploaderLabelByUserId.has(userId));
  if (unresolvedUploaderUserIds.length > 0) {
    const admin = createSupabaseAdminClient();
    await Promise.all(
      unresolvedUploaderUserIds.map(async (userId) => {
        const { data } = await admin.auth.admin.getUserById(userId);
        const authUser = data?.user;
        const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
        const fromMetadata = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
        const fallbackLabel = fromMetadata || authUser?.email || "Administrador";
        uploaderLabelByUserId.set(userId, fallbackLabel);
      }),
    );
  }

  const editEmployeeDocumentsBySlot: Record<string, EmployeeDocumentSlot> = {};
  for (const row of (editEmployeeDocuments.data ?? []) as Array<{
    document_id: string;
    status: string;
    requested_without_file?: boolean;
    reviewed_by?: string | null;
    review_comment?: string | null;
    expires_at?: string | null;
    reminder_days?: number | null;
    has_no_expiration?: boolean;
    signature_status?: string | null;
    signature_embed_src?: string | null;
    signature_requested_at?: string | null;
    signature_completed_at?: string | null;
    created_at?: string;
    linked_document:
      | { id?: string; title?: string; owner_user_id?: string | null; mime_type?: string | null; original_file_name?: string | null; file_path?: string | null }[]
      | { id?: string; title?: string; owner_user_id?: string | null; mime_type?: string | null; original_file_name?: string | null; file_path?: string | null }
      | null;
  }>) {
    const linked = Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document;
    const title = typeof linked?.title === "string" ? linked.title : "";
    const slot = EMPLOYEE_DOCUMENT_SLOT_RULES.find((rule) => title.startsWith(rule.prefix))?.slot;
    const finalSlot = slot || `custom_${row.document_id}`;
    if (editEmployeeDocumentsBySlot[finalSlot]) continue;
    const uploadedByRole = linked?.owner_user_id && editEmployee?.userId && linked.owner_user_id === editEmployee.userId
      ? "employee"
      : "company";
    const uploaderUserId = linked?.owner_user_id ?? row.reviewed_by ?? null;
    const uploadedByLabel = uploadedByRole === "employee"
      ? "Empleado"
      : (uploaderUserId ? uploaderLabelByUserId.get(uploaderUserId) ?? "Administrador" : "Administrador");
    editEmployeeDocumentsBySlot[finalSlot] = {
      documentId: row.document_id,
      title,
      status: row.status,
      requested_without_file: row.requested_without_file === true,
      uploaded_by_role: uploadedByRole,
      uploaded_by_label: uploadedByLabel,
      review_comment: row.review_comment ?? null,
      expires_at: row.expires_at ?? null,
      reminder_days: row.reminder_days === 15 || row.reminder_days === 30 || row.reminder_days === 45
        ? row.reminder_days
        : null,
      has_no_expiration: row.has_no_expiration === true,
      expiration_configured: Boolean(row.expires_at) || row.has_no_expiration === true,
      signature_status: row.signature_status === "requested" || row.signature_status === "viewed" || row.signature_status === "completed" || row.signature_status === "declined" || row.signature_status === "expired" || row.signature_status === "failed"
        ? row.signature_status
        : null,
      signature_embed_src: row.signature_embed_src ?? null,
      signature_requested_at: row.signature_requested_at ?? null,
      signature_completed_at: row.signature_completed_at ?? null,
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
        "title.ilike.SSN / EAD - %",
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
      const finalSlot = slot || `custom_${row.id}`;
      editUserDocumentsBySlot[finalSlot] = {
        documentId: row.id,
        title: row.title,
        status: "uploaded",
        uploaded_by_role: "company",
        uploaded_by_label: "Empresa",
        review_comment: null,
        expires_at: null,
        reminder_days: null,
        has_no_expiration: false,
        expiration_configured: false,
        signature_status: null,
        signature_embed_src: null,
        signature_requested_at: null,
        signature_completed_at: null,
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
        location_scope_ids: editEmployee.locationScopeIds ?? [],
        all_locations: editEmployee.allLocations === true,
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
        delegated_permissions: normalizeEmployeeDelegatedPermissions(
          (editEmployee.userId ? delegatedPermissionsByMembershipId.get(membershipIdByUserId.get(editEmployee.userId) ?? "") : null) ??
            getEmptyEmployeeDelegatedPermissions(),
        ),
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
          location_scope_ids: Array.isArray(editUserProfile.location_scope_ids) ? editUserProfile.location_scope_ids : [],
          all_locations: editUserProfile.all_locations === true,
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
          delegated_permissions: normalizeEmployeeDelegatedPermissions(
            (editUserProfile.user_id
              ? delegatedPermissionsByMembershipId.get(membershipIdByUserId.get(editUserProfile.user_id) ?? "")
              : null) ?? getEmptyEmployeeDelegatedPermissions(),
          ),
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
      branchName: emp.branchName ?? "Sin locación",
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
      branchName: profile.all_locations
        ? "Todas las locaciones"
        : (Array.isArray(profile.location_scope_ids) && profile.location_scope_ids.length > 1
          ? `${profile.location_scope_ids.length} locaciones`
          : (profile.branch_id ? (branchNameById.get(profile.branch_id) ?? "Sin locación") : "Sin locación")),
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
