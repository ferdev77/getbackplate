import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  getEmptyEmployeeDelegatedPermissions,
  getEmployeeDelegatedPermissionsByMembership,
  type EmployeeDelegatedPermissionsMap,
} from "@/modules/employees/lib/module-permissions";
import { resolveEmployeeDocumentSlotFromTitle } from "@/modules/employees/lib/document-slots";
import { isEmployeeInScope } from "@/modules/employees/lib/api-scope";

const DOCUMENT_TITLE_LIKE_CLAUSES = [
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
].join(",");

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

export type EmployeeOrUserEditDetail = {
  id: string;
  organization_user_profile_id?: string;
  first_name: string;
  last_name: string;
  birth_date: string | null;
  sex: string | null;
  nationality: string | null;
  phone_country_code: string | null;
  phone: string | null;
  email: string;
  personal_email: string | null;
  document_type: string | null;
  document_number: string | null;
  address: string | null;
  branch_id: string;
  location_scope_ids: string[];
  all_locations: boolean;
  position: string;
  position_id: string;
  department_id: string;
  status: string;
  hire_date: string | null;
  contract_type: string | null;
  contract_status: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  contract_notes: string | null;
  contract_signer_name: string | null;
  contract_signed_at: string | null;
  salary_amount: number | null;
  payment_frequency: string | null;
  salary_currency: string | null;
  has_dashboard_access: boolean;
  documents_by_slot: Record<string, EmployeeDocumentSlot>;
  delegated_permissions: EmployeeDelegatedPermissionsMap;
};

type EditDetailOptions = {
  // Restricts the lookup to HR-delegated employees with a limited branch scope.
  // undefined/null means "no restriction" (company admin).
  allowedBranchIds?: string[] | null;
};

async function resolveUploaderLabels(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  userIds: string[],
) {
  const uploaderLabelByUserId = new Map<string, string>();
  if (!userIds.length) return uploaderLabelByUserId;

  const { data: uploaderProfiles } = await admin
    .from("organization_user_profiles")
    .select("user_id, first_name, last_name, email")
    .eq("organization_id", organizationId)
    .in("user_id", userIds);

  for (const row of uploaderProfiles ?? []) {
    const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
    uploaderLabelByUserId.set(row.user_id, fullName || row.email || "Administrador");
  }

  const unresolved = userIds.filter((id) => !uploaderLabelByUserId.has(id));
  if (unresolved.length) {
    await Promise.all(
      unresolved.map(async (userId) => {
        const { data } = await admin.auth.admin.getUserById(userId);
        const authUser = data?.user;
        const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
        const fromMetadata = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
        uploaderLabelByUserId.set(userId, fromMetadata || authUser?.email || "Administrador");
      }),
    );
  }

  return uploaderLabelByUserId;
}

async function resolveDashboardAccessAndPermissions(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  organizationId: string,
  userId: string | null,
) {
  if (!userId) {
    return { hasDashboardAccess: false, delegatedPermissions: getEmptyEmployeeDelegatedPermissions() };
  }

  const { data: membershipRow } = await admin
    .from("memberships")
    .select("id, status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  return {
    hasDashboardAccess: membershipRow?.status === "active",
    delegatedPermissions: membershipRow?.id
      ? await getEmployeeDelegatedPermissionsByMembership(organizationId, membershipRow.id)
      : getEmptyEmployeeDelegatedPermissions(),
  };
}

const VALID_SIGNATURE_STATUSES = new Set(["requested", "viewed", "completed", "declined", "expired", "failed"]);

export async function getEmployeeEditDetail(
  organizationId: string,
  employeeId: string,
  options: EditDetailOptions = {},
): Promise<EmployeeOrUserEditDetail | null> {
  const admin = createSupabaseAdminClient();

  const { data: employee } = await admin
    .from("employees")
    .select(
      "id, user_id, first_name, last_name, email, phone, phone_country_code, position, department_id, status, branch_id, all_locations, location_scope_ids, hired_at, birth_date, sex, nationality, address_line1, document_type, document_number, personal_email",
    )
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) return null;
  if (options.allowedBranchIds !== undefined && !isEmployeeInScope(employee, options.allowedBranchIds ?? null)) {
    return null;
  }

  let positionId = "";
  if (employee.position && employee.department_id) {
    const { data: posRow } = await admin
      .from("department_positions")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("department_id", employee.department_id)
      .ilike("name", employee.position)
      .maybeSingle();
    positionId = posRow?.id ?? "";
  }

  const { data: contractRow } = await admin
    .from("employee_contracts")
    .select("contract_type, contract_status, start_date, end_date, notes, signer_name, salary_amount, salary_currency, payment_frequency, signed_at")
    .eq("organization_id", organizationId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: employeeDocuments } = await admin
    .from("employee_documents")
    .select(
      "document_id, status, requested_without_file, reviewed_by, review_comment, expires_at, reminder_days, has_no_expiration, signature_status, signature_embed_src, signature_requested_at, signature_completed_at, created_at, linked_document:documents(id, title, owner_user_id)",
    )
    .eq("organization_id", organizationId)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });

  type LinkedDoc = { id?: string; title?: string; owner_user_id?: string | null };
  const normalizedDocs = (employeeDocuments ?? []).map((row) => ({
    ...row,
    linked: (Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document) as LinkedDoc | null,
  }));

  const uploaderUserIds = Array.from(
    new Set(
      normalizedDocs
        .flatMap((row) => [row.linked?.owner_user_id ?? null, row.reviewed_by ?? null])
        .filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  );
  const uploaderLabelByUserId = await resolveUploaderLabels(admin, organizationId, uploaderUserIds);

  const documentsBySlot: Record<string, EmployeeDocumentSlot> = {};
  for (const row of normalizedDocs) {
    const title = typeof row.linked?.title === "string" ? row.linked.title : "";
    const slot = resolveEmployeeDocumentSlotFromTitle(title);
    const finalSlot = slot || `custom_${row.document_id}`;
    if (documentsBySlot[finalSlot]) continue;

    const uploadedByRole: "employee" | "company" =
      row.linked?.owner_user_id && employee.user_id && row.linked.owner_user_id === employee.user_id ? "employee" : "company";
    const uploaderUserId = row.linked?.owner_user_id ?? row.reviewed_by ?? null;

    documentsBySlot[finalSlot] = {
      documentId: row.document_id,
      title,
      status: row.status,
      requested_without_file: row.requested_without_file === true,
      uploaded_by_role: uploadedByRole,
      uploaded_by_label: uploadedByRole === "employee" ? "Empleado" : (uploaderUserId ? uploaderLabelByUserId.get(uploaderUserId) ?? "Administrador" : "Administrador"),
      review_comment: row.review_comment ?? null,
      expires_at: row.expires_at ?? null,
      reminder_days: row.reminder_days === 15 || row.reminder_days === 30 || row.reminder_days === 45 ? row.reminder_days : null,
      has_no_expiration: row.has_no_expiration === true,
      expiration_configured: Boolean(row.expires_at) || row.has_no_expiration === true,
      signature_status: VALID_SIGNATURE_STATUSES.has(String(row.signature_status))
        ? (row.signature_status as EmployeeDocumentSlot["signature_status"])
        : null,
      signature_embed_src: row.signature_embed_src ?? null,
      signature_requested_at: row.signature_requested_at ?? null,
      signature_completed_at: row.signature_completed_at ?? null,
    };
  }

  const { hasDashboardAccess, delegatedPermissions } = await resolveDashboardAccessAndPermissions(
    admin,
    organizationId,
    employee.user_id,
  );

  return {
    id: employee.id,
    first_name: employee.first_name ?? "",
    last_name: employee.last_name ?? "",
    birth_date: employee.birth_date ?? null,
    sex: employee.sex ?? null,
    nationality: employee.nationality ?? null,
    phone_country_code: employee.phone_country_code ?? null,
    phone: employee.phone ?? null,
    email: employee.email ?? "",
    personal_email: employee.personal_email ?? null,
    document_type: employee.document_type ?? null,
    document_number: employee.document_number ?? null,
    address: employee.address_line1 ?? null,
    branch_id: employee.branch_id ?? "",
    location_scope_ids: Array.isArray(employee.location_scope_ids) ? employee.location_scope_ids : [],
    all_locations: employee.all_locations === true,
    position: employee.position ?? "",
    position_id: positionId,
    department_id: employee.department_id ?? "",
    status: employee.status ?? "",
    hire_date: employee.hired_at ?? null,
    contract_type: contractRow?.contract_type ?? null,
    contract_status: contractRow?.contract_status ?? null,
    contract_start_date: contractRow?.start_date ?? null,
    contract_end_date: contractRow?.end_date ?? null,
    contract_notes: contractRow?.notes ?? null,
    contract_signer_name: contractRow?.signer_name ?? null,
    contract_signed_at: contractRow?.signed_at ?? null,
    salary_amount: contractRow?.salary_amount ?? null,
    payment_frequency: contractRow?.payment_frequency ?? null,
    salary_currency: contractRow?.salary_currency ?? null,
    has_dashboard_access: hasDashboardAccess,
    documents_by_slot: documentsBySlot,
    delegated_permissions: delegatedPermissions,
  };
}

export async function getUserProfileEditDetail(
  organizationId: string,
  profileId: string,
  options: EditDetailOptions = {},
): Promise<EmployeeOrUserEditDetail | null> {
  const admin = createSupabaseAdminClient();

  const { data: profile } = await admin
    .from("organization_user_profiles")
    .select("id, user_id, first_name, last_name, email, phone, branch_id, all_locations, location_scope_ids, department_id, status")
    .eq("organization_id", organizationId)
    .eq("id", profileId)
    .eq("is_employee", false)
    .maybeSingle();

  if (!profile) return null;
  if (options.allowedBranchIds !== undefined && !isEmployeeInScope(profile, options.allowedBranchIds ?? null)) {
    return null;
  }

  const documentsBySlot: Record<string, EmployeeDocumentSlot> = {};
  if (profile.user_id) {
    const { data: userDocuments } = await admin
      .from("documents")
      .select("id, title, access_scope")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or(DOCUMENT_TITLE_LIKE_CLAUSES);

    for (const row of userDocuments ?? []) {
      const scope = row.access_scope as { users?: unknown } | null;
      const users = Array.isArray(scope?.users) ? scope.users.filter((value): value is string => typeof value === "string") : [];
      if (!users.includes(profile.user_id)) continue;

      const slot = resolveEmployeeDocumentSlotFromTitle(typeof row.title === "string" ? row.title : null);
      const finalSlot = slot || `custom_${row.id}`;
      documentsBySlot[finalSlot] = {
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

  const { hasDashboardAccess, delegatedPermissions } = await resolveDashboardAccessAndPermissions(
    admin,
    organizationId,
    profile.user_id,
  );

  return {
    id: "",
    organization_user_profile_id: profile.id,
    first_name: profile.first_name ?? "",
    last_name: profile.last_name ?? "",
    birth_date: null,
    sex: null,
    nationality: null,
    phone_country_code: null,
    phone: profile.phone ?? null,
    email: profile.email ?? "",
    personal_email: null,
    document_type: null,
    document_number: null,
    address: null,
    branch_id: profile.branch_id ?? "",
    location_scope_ids: Array.isArray(profile.location_scope_ids) ? profile.location_scope_ids : [],
    all_locations: profile.all_locations === true,
    position: "",
    position_id: "",
    department_id: profile.department_id ?? "",
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
    has_dashboard_access: hasDashboardAccess,
    documents_by_slot: documentsBySlot,
    delegated_permissions: delegatedPermissions,
  };
}
