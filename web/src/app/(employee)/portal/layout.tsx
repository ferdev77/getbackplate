import type { Metadata } from "next";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireEmployeeAccess } from "@/shared/lib/access";
import { EmployeeShell } from "@/shared/ui/employee-shell";
import { resolveEmployeeDocumentSlotFromTitle } from "@/shared/lib/employee-document-slots";
import {
  getEnabledModulesCached,
  getOrganizationSettingsCached,
  getOrganizationByIdCached,
} from "@/modules/organizations/cached-queries";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";

function normalizeDateInput(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const matched = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : null;
}

function normalizeDocumentType(value: unknown): "dni" | "cuil" | "ssn" | "passport" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  if (["dni", "documento nacional de identidad"].includes(normalized)) return "dni";
  if (["cuil", "cuit", "cuil/cuit", "cuil / cuit"].includes(normalized)) return "cuil";
  if (["ssn", "itin", "ssn/itin", "ssn / itin"].includes(normalized)) return "ssn";
  if (["passport", "pasaporte"].includes(normalized)) return "passport";
  if (normalized.includes("dni")) return "dni";
  if (normalized.includes("cuil") || normalized.includes("cuit")) return "cuil";
  if (normalized.includes("ssn") || normalized.includes("itin")) return "ssn";
  if (normalized.includes("passport") || normalized.includes("pasaporte")) return "passport";

  return null;
}

const EMPLOYEE_PROFILE_SELECT = "id, user_id, first_name, last_name, position, department_id, branch_id, email, phone, phone_country_code, birth_date, document_type, document_number, address_line1, hired_at, personal_email";

export async function generateMetadata(): Promise<Metadata> {
  let tenant;
  try {
    tenant = await requireEmployeeAccess();
  } catch {
    return {};
  }

  const [organization, orgSettings, enabledModules] = await Promise.all([
    getOrganizationByIdCached(tenant.organizationId),
    getOrganizationSettingsCached(tenant.organizationId),
    getEnabledModulesCached(tenant.organizationId),
  ]);

  const customBranding = enabledModules.includes("custom_branding");

  if (customBranding && (organization?.name || orgSettings?.company_favicon_url)) {
    return {
      title: {
        template: `%s | ${organization?.name ?? "Portal"}`,
        default: organization?.name ?? "Portal",
      },
      icons: orgSettings?.company_favicon_url
        ? {
            icon: [
              { url: orgSettings.company_favicon_url },
            ],
          }
        : undefined,
    };
  }

  return {};
}

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAuthenticatedUser();
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const organizationPromise = getOrganizationByIdCached(tenant.organizationId);
  const settingsPromise = getOrganizationSettingsCached(tenant.organizationId);
  const candidateEmails = Array.from(
    new Set([
      user.email,
      typeof user.user_metadata?.email === "string" ? user.user_metadata.email : null,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)),
  );

  const [{ data: employee }, { data: employeeProfileRow }, { data: branch }, organizationData] = await Promise.all([
    supabase
      .from("employees")
      .select(EMPLOYEE_PROFILE_SELECT)
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("organization_user_profiles")
      .select("employee_id, first_name, last_name, email, phone, branch_id, department_id, position_id")
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    (tenant.branchId ?? null)
      ? supabase
          .from("branches")
          .select("name, city")
          .eq("organization_id", tenant.organizationId)
          .eq("id", tenant.branchId ?? null)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    organizationPromise,
  ]);

  const { data: profileByEmail } = !employeeProfileRow && candidateEmails.length > 0
    ? await supabase
        .from("organization_user_profiles")
        .select("employee_id, first_name, last_name, email, phone, branch_id, department_id, position_id")
        .eq("organization_id", tenant.organizationId)
        .eq("status", "active")
        .in("email", candidateEmails)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const resolvedProfileRow = employeeProfileRow ?? profileByEmail ?? null;

  const { data: employeeFromProfileId } = !employee?.id && resolvedProfileRow?.employee_id
    ? await supabase
        .from("employees")
        .select(EMPLOYEE_PROFILE_SELECT)
        .eq("organization_id", tenant.organizationId)
        .eq("id", resolvedProfileRow.employee_id)
        .maybeSingle()
    : { data: null };

  const { data: employeeFromEmail } = !employee?.id && !employeeFromProfileId?.id && user.email
    ? await supabase
        .from("employees")
        .select(EMPLOYEE_PROFILE_SELECT)
        .eq("organization_id", tenant.organizationId)
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const lookupCandidateEmails = Array.from(
    new Set([
      user.email,
      resolvedProfileRow?.email,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)),
  );

  const { data: employeeFromCandidateEmails } =
    !employee?.id && !employeeFromProfileId?.id && !employeeFromEmail?.id && lookupCandidateEmails.length > 0
      ? await supabase
          .from("employees")
          .select(EMPLOYEE_PROFILE_SELECT)
          .eq("organization_id", tenant.organizationId)
          .or([
            `email.in.(${lookupCandidateEmails.map((item) => `\"${item}\"`).join(",")})`,
            `personal_email.in.(${lookupCandidateEmails.map((item) => `\"${item}\"`).join(",")})`,
          ].join(","))
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  const { data: employeeFromNameMatch } =
    !employee?.id &&
    !employeeFromProfileId?.id &&
    !employeeFromEmail?.id &&
    !employeeFromCandidateEmails?.id &&
    resolvedProfileRow?.first_name &&
    resolvedProfileRow?.last_name
      ? await supabase
          .from("employees")
          .select(EMPLOYEE_PROFILE_SELECT)
          .eq("organization_id", tenant.organizationId)
          .eq("first_name", resolvedProfileRow.first_name)
          .eq("last_name", resolvedProfileRow.last_name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

  let resolvedEmployee =
    employee ?? employeeFromProfileId ?? employeeFromEmail ?? employeeFromCandidateEmails ?? employeeFromNameMatch ?? null;

  if (!resolvedEmployee || (!resolvedEmployee.birth_date && !resolvedEmployee.document_type && !resolvedEmployee.document_number)) {
    const admin = createSupabaseAdminClient();
    const adminCandidateEmails = Array.from(
      new Set([
        user.email,
        resolvedProfileRow?.email,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)),
    );

    const { data: employeeFromAdminByUser } = await admin
      .from("employees")
      .select(EMPLOYEE_PROFILE_SELECT)
      .eq("organization_id", tenant.organizationId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: employeeFromAdminByProfileId } = !employeeFromAdminByUser && resolvedProfileRow?.employee_id
      ? await admin
          .from("employees")
          .select(EMPLOYEE_PROFILE_SELECT)
          .eq("organization_id", tenant.organizationId)
          .eq("id", resolvedProfileRow.employee_id)
          .maybeSingle()
      : { data: null };

    const { data: employeeFromAdminByEmail } =
      !employeeFromAdminByUser && !employeeFromAdminByProfileId && adminCandidateEmails.length > 0
        ? await admin
            .from("employees")
            .select(EMPLOYEE_PROFILE_SELECT)
            .eq("organization_id", tenant.organizationId)
            .or([
              `email.in.(${adminCandidateEmails.map((item) => `\"${item}\"`).join(",")})`,
              `personal_email.in.(${adminCandidateEmails.map((item) => `\"${item}\"`).join(",")})`,
            ].join(","))
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };

    const { data: employeeFromAdminByName } =
      !employeeFromAdminByUser &&
      !employeeFromAdminByProfileId &&
      !employeeFromAdminByEmail &&
      resolvedProfileRow?.first_name &&
      resolvedProfileRow?.last_name
        ? await admin
            .from("employees")
            .select(EMPLOYEE_PROFILE_SELECT)
            .eq("organization_id", tenant.organizationId)
            .eq("first_name", resolvedProfileRow.first_name)
            .eq("last_name", resolvedProfileRow.last_name)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };

    resolvedEmployee =
      employeeFromAdminByUser ?? employeeFromAdminByProfileId ?? employeeFromAdminByEmail ?? employeeFromAdminByName ?? resolvedEmployee;
  }

  const metadataFullName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const metadataPhone =
    (typeof user.phone === "string" && user.phone.trim()) ||
    (typeof (user.user_metadata as Record<string, unknown> | undefined)?.phone === "string"
      ? String((user.user_metadata as Record<string, unknown>).phone).trim()
      : "");
  const [metadataFirstName = "", ...metadataLastNameParts] = metadataFullName ? metadataFullName.split(/\s+/) : [];
  const metadataLastName = metadataLastNameParts.join(" ");
  const resolvedPhone =
    resolvedEmployee?.phone ??
    resolvedProfileRow?.phone ??
    (metadataPhone || null);

  let latestContract: {
    contract_type: string | null;
    contract_status: string | null;
    start_date: string | null;
    end_date: string | null;
    salary_amount: number | null;
    salary_currency: string | null;
    payment_frequency: string | null;
    signer_name: string | null;
    signed_at: string | null;
  } | null = null;
  let employeeDocumentLinks: unknown[] = [];

  if (resolvedEmployee?.id) {
    const [contractResult, employeeDocsResult] = await Promise.all([
      supabase
        .from("employee_contracts")
        .select("contract_type, contract_status, start_date, end_date, salary_amount, salary_currency, payment_frequency, signer_name, signed_at")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", resolvedEmployee.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("employee_documents")
        .select("status, requested_without_file, reviewed_at, reviewed_by, review_comment, expires_at, reminder_days, has_no_expiration, signature_status, signature_embed_src, signature_requested_at, signature_completed_at, linked_document:documents(id, title, owner_user_id, mime_type, original_file_name, file_path)")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", resolvedEmployee.id)
        .order("created_at", { ascending: false }),
    ]);

    latestContract = contractResult.data ?? null;
    if (
      employeeDocsResult.error &&
      ["review_comment", "expires_at", "reminder_days", "has_no_expiration", "signature_status", "signature_embed_src", "signature_requested_at", "signature_completed_at", "requested_without_file"].some((field) => String(employeeDocsResult.error?.message ?? "").includes(field))
    ) {
      const fallbackDocsResult = await supabase
        .from("employee_documents")
        .select("status, reviewed_at, reviewed_by, linked_document:documents(id, title, owner_user_id, mime_type, original_file_name, file_path)")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", resolvedEmployee.id)
        .order("created_at", { ascending: false });
      employeeDocumentLinks = fallbackDocsResult.data ?? [];
    } else {
      employeeDocumentLinks = employeeDocsResult.data ?? [];
    }
  }

  if (resolvedEmployee?.id && !latestContract && (employeeDocumentLinks?.length ?? 0) === 0) {
    const admin = createSupabaseAdminClient();
    const [adminContractResult, adminEmployeeDocumentLinksResult] = await Promise.all([
      admin
        .from("employee_contracts")
        .select("contract_type, contract_status, start_date, end_date, salary_amount, salary_currency, payment_frequency, signer_name, signed_at")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", resolvedEmployee.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("employee_documents")
        .select("status, requested_without_file, reviewed_at, reviewed_by, review_comment, expires_at, reminder_days, has_no_expiration, signature_status, signature_embed_src, signature_requested_at, signature_completed_at, linked_document:documents(id, title, owner_user_id, mime_type, original_file_name, file_path)")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", resolvedEmployee.id)
        .order("created_at", { ascending: false }),
    ]);

    latestContract = adminContractResult.data ?? null;
    if (
      adminEmployeeDocumentLinksResult.error &&
      ["review_comment", "expires_at", "reminder_days", "has_no_expiration", "signature_status", "signature_embed_src", "signature_requested_at", "signature_completed_at", "requested_without_file"].some((field) => String(adminEmployeeDocumentLinksResult.error?.message ?? "").includes(field))
    ) {
      const fallbackAdminDocsResult = await admin
        .from("employee_documents")
        .select("status, reviewed_at, reviewed_by, linked_document:documents(id, title, owner_user_id, mime_type, original_file_name, file_path)")
        .eq("organization_id", tenant.organizationId)
        .eq("employee_id", resolvedEmployee.id)
        .order("created_at", { ascending: false });
      employeeDocumentLinks = fallbackAdminDocsResult.data ?? [];
    } else {
      employeeDocumentLinks = adminEmployeeDocumentLinksResult.data ?? [];
    }
  }

  const brandingSettings = await settingsPromise;

  const { data: department } = resolvedEmployee?.department_id
    ? await supabase
        .from("organization_departments")
        .select("name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", resolvedEmployee.department_id)
        .maybeSingle()
    : { data: null };

  const resolvedBranchId = resolvedEmployee?.branch_id ?? resolvedProfileRow?.branch_id ?? tenant.branchId ?? null;
  const resolvedDepartmentId = resolvedEmployee?.department_id ?? resolvedProfileRow?.department_id ?? null;

  const { data: fallbackDepartment } = !department && resolvedDepartmentId
    ? await supabase
        .from("organization_departments")
        .select("name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", resolvedDepartmentId)
        .maybeSingle()
    : { data: null };

  const resolvedPositionId = resolvedProfileRow?.position_id ?? null;
  const { data: positionById } = resolvedPositionId
    ? await supabase
        .from("department_positions")
        .select("id, department_id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("id", resolvedPositionId)
        .maybeSingle()
    : { data: null };
  const { data: fallbackPositionRow } = !positionById?.id && resolvedEmployee?.position
    ? await supabase
        .from("department_positions")
        .select("id, department_id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("name", resolvedEmployee.position)
        .limit(1)
        .maybeSingle()
    : { data: null };
  const legacyPositionId = !resolvedPositionId && !positionById?.id && !fallbackPositionRow?.id && resolvedEmployee?.position
    ? "__legacy_position__"
    : null;

  const employeeBranchId = resolvedBranchId;

  const resolvedBranch = employeeBranchId
    ? await supabase
        .from("branches")
        .select("name, city")
        .eq("organization_id", tenant.organizationId)
        .eq("id", employeeBranchId)
        .maybeSingle()
    : { data: null };

  const enabledModulesArr = await getEnabledModulesCached(tenant.organizationId);
  const enabledModuleCodes = new Set(enabledModulesArr);
  const customBrandingEnabled = enabledModuleCodes.has("custom_branding");
  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );

  const isDocumentsEnabled = enabledModuleCodes.has("documents");
  const isChecklistEnabled = enabledModuleCodes.has("checklists");
  const isAnnouncementsEnabled = enabledModuleCodes.has("announcements");
  const isOnboardingEnabled = enabledModuleCodes.has("onboarding");
  const isAiAssistantEnabled = enabledModuleCodes.has("ai_assistant") && delegatedPermissions.ai_assistant.create;

  const docsCount = 0;

  const employeeName =
    `${resolvedEmployee?.first_name ?? resolvedProfileRow?.first_name ?? metadataFirstName ?? ""} ${resolvedEmployee?.last_name ?? resolvedProfileRow?.last_name ?? metadataLastName ?? ""}`.trim() ||
    metadataFullName ||
    user.email ||
    "Empleado";

  const checklistTemplateNames: string[] = [];

  const profileDocumentsBySlot = new Map<
    string,
    {
      status: string;
      reviewedAt: string | null;
      documentId: string | null;
      title: string | null;
      requestedWithoutFile: boolean;
      uploadedByRole: "employee" | "company";
      uploadedByLabel: string;
      reviewComment: string | null;
      expiresAt: string | null;
      reminderDays: 15 | 30 | 45 | null;
      hasNoExpiration: boolean;
      signatureStatus: "requested" | "viewed" | "completed" | "declined" | "expired" | "failed" | null;
      signatureEmbedSrc: string | null;
      signatureRequestedAt: string | null;
      signatureCompletedAt: string | null;
    }
  >();

  const documentOwnerUserIds = Array.from(
    new Set(
      ((employeeDocumentLinks ?? []) as Array<{
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

  const uploaderProfileByUserId = new Map<string, { first_name: string | null; last_name: string | null; email: string | null }>();
  const uploaderLabelByUserId = new Map<string, string>();
  if (documentOwnerUserIds.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: uploaderProfiles } = await admin
      .from("organization_user_profiles")
      .select("user_id, first_name, last_name, email")
      .eq("organization_id", tenant.organizationId)
      .in("user_id", documentOwnerUserIds);

    for (const row of uploaderProfiles ?? []) {
      uploaderProfileByUserId.set(row.user_id, {
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,
        email: row.email ?? null,
      });
      const fullName = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
      uploaderLabelByUserId.set(row.user_id, fullName || row.email || "Administrador");
    }

    const unresolvedOwnerIds = documentOwnerUserIds.filter((userId) => !uploaderLabelByUserId.has(userId));
    if (unresolvedOwnerIds.length > 0) {
      await Promise.all(
        unresolvedOwnerIds.map(async (userId) => {
          const { data } = await admin.auth.admin.getUserById(userId);
          const authUser = data?.user;
          const metadata = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
          const fromMetadata = typeof metadata.full_name === "string" ? metadata.full_name.trim() : "";
          uploaderLabelByUserId.set(userId, fromMetadata || authUser?.email || "Administrador");
        }),
      );
    }
  }

  for (const row of (employeeDocumentLinks ?? []) as Array<{
    status: string;
    requested_without_file?: boolean;
    reviewed_at: string | null;
    reviewed_by?: string | null;
    review_comment?: string | null;
    expires_at?: string | null;
    reminder_days?: number | null;
    has_no_expiration?: boolean;
    signature_status?: string | null;
    signature_embed_src?: string | null;
    signature_requested_at?: string | null;
    signature_completed_at?: string | null;
    linked_document:
      | { id?: string; title?: string; owner_user_id?: string | null; mime_type?: string | null; original_file_name?: string | null; file_path?: string | null }[]
      | { id?: string; title?: string; owner_user_id?: string | null; mime_type?: string | null; original_file_name?: string | null; file_path?: string | null }
      | null;
  }>) {
    const linked = Array.isArray(row.linked_document) ? row.linked_document[0] : row.linked_document;
    const resolvedSlot = resolveEmployeeDocumentSlotFromTitle(linked?.title);
    const fallbackCustomSlot = linked?.id ? `custom_${linked.id}` : null;
    const slot = resolvedSlot ?? fallbackCustomSlot;
    if (!slot || profileDocumentsBySlot.has(slot)) continue;
    const uploadedByRole = linked?.owner_user_id && resolvedEmployee?.user_id && linked.owner_user_id === resolvedEmployee.user_id
      ? "employee"
      : "company";
    const uploaderUserId = linked?.owner_user_id ?? row.reviewed_by ?? null;
    const uploaderProfile = uploaderUserId ? uploaderProfileByUserId.get(uploaderUserId) : null;
    const uploadedByLabel = uploadedByRole === "employee"
      ? "Empleado"
      : (uploaderUserId ? uploaderLabelByUserId.get(uploaderUserId) : null)
        || (`${uploaderProfile?.first_name ?? ""} ${uploaderProfile?.last_name ?? ""}`.trim() || uploaderProfile?.email || "Administrador");
    profileDocumentsBySlot.set(slot, {
      status: row.status,
      reviewedAt: row.reviewed_at,
      documentId: linked?.id ?? null,
      title: linked?.title ?? null,
      requestedWithoutFile: row.requested_without_file === true,
      uploadedByRole,
      uploadedByLabel,
      reviewComment: row.review_comment ?? null,
      expiresAt: row.expires_at ?? null,
      reminderDays: row.reminder_days === 15 || row.reminder_days === 30 || row.reminder_days === 45
        ? row.reminder_days
        : null,
      hasNoExpiration: row.has_no_expiration === true,
      signatureStatus: row.signature_status === "requested" || row.signature_status === "viewed" || row.signature_status === "completed" || row.signature_status === "declined" || row.signature_status === "expired" || row.signature_status === "failed"
        ? row.signature_status
        : null,
      signatureEmbedSrc: row.signature_embed_src ?? null,
      signatureRequestedAt: row.signature_requested_at ?? null,
      signatureCompletedAt: row.signature_completed_at ?? null,
    });
  }

  const fixedDocumentSlots = ["photo", "id", "ssn", "rec1", "rec2", "other"] as const;
  const fixedDocumentSlotSet = new Set<string>(fixedDocumentSlots);
  const customDocumentSlots = Array.from(profileDocumentsBySlot.keys()).filter((slot) => !fixedDocumentSlotSet.has(slot));
  const allDocumentSlotsInOrder = [...fixedDocumentSlots, ...customDocumentSlots];

  const employeeProfile = {
    id: resolvedEmployee?.id ?? "",
    first_name: resolvedEmployee?.first_name ?? resolvedProfileRow?.first_name ?? metadataFirstName ?? "",
    last_name: resolvedEmployee?.last_name ?? resolvedProfileRow?.last_name ?? metadataLastName ?? "",
    email: resolvedEmployee?.email ?? resolvedProfileRow?.email ?? user.email ?? "",
    branch_id: resolvedBranchId ?? resolvedProfileRow?.branch_id ?? "",
    department_id: resolvedDepartmentId ?? resolvedProfileRow?.department_id ?? "",
    position_id: resolvedPositionId ?? positionById?.id ?? fallbackPositionRow?.id ?? legacyPositionId ?? "",
    document_type: normalizeDocumentType(resolvedEmployee?.document_type),
    document_number: resolvedEmployee?.document_number ?? null,
    personal_email: resolvedEmployee?.personal_email ?? null,
    phone: resolvedPhone ?? resolvedProfileRow?.phone ?? null,
    address: resolvedEmployee?.address_line1 ?? null,
    birth_date: normalizeDateInput(resolvedEmployee?.birth_date),
    hire_date: normalizeDateInput(resolvedEmployee?.hired_at),
    contract_type: latestContract?.contract_type ?? null,
    contract_signed_at: normalizeDateInput(latestContract?.signed_at),
    contract_signer_name: latestContract?.signer_name ?? null,
    salary_amount: latestContract?.salary_amount ?? null,
    salary_currency: latestContract?.salary_currency ?? null,
    payment_frequency: latestContract?.payment_frequency ?? null,
    has_dashboard_access: true,
    documents_by_slot: allDocumentSlotsInOrder.reduce<Record<string, {
      documentId: string;
      title: string;
      status: string;
      requested_without_file: boolean;
      uploaded_by_role: "employee" | "company";
      uploaded_by_label: string;
      review_comment: string | null;
      expires_at: string | null;
      reminder_days: 15 | 30 | 45 | null;
      has_no_expiration: boolean;
      expiration_configured: boolean;
      signature_status: "requested" | "viewed" | "completed" | "declined" | "expired" | "failed" | null;
      signature_embed_src: string | null;
      signature_requested_at: string | null;
      signature_completed_at: string | null;
    }>>((acc, slot) => {
      const row = profileDocumentsBySlot.get(slot);
      if (!row?.documentId) return acc;
      acc[slot] = {
        documentId: row.documentId,
        title: row.title ?? "",
        status: row.status,
        requested_without_file: row.requestedWithoutFile,
        uploaded_by_role: row.uploadedByRole,
        uploaded_by_label: row.uploadedByLabel,
        review_comment: row.reviewComment,
        expires_at: row.expiresAt,
        reminder_days: row.reminderDays,
        has_no_expiration: row.hasNoExpiration,
        expiration_configured: Boolean(row.expiresAt) || row.hasNoExpiration,
        signature_status: row.signatureStatus,
        signature_embed_src: row.signatureEmbedSrc,
        signature_requested_at: row.signatureRequestedAt,
        signature_completed_at: row.signatureCompletedAt,
      };
      return acc;
    }, {}),
  };

  const profileBranches = resolvedBranchId
    ? [{
        id: resolvedBranchId,
        name: customBrandingEnabled
          ? ((resolvedBranch.data ?? branch)?.city ?? (resolvedBranch.data ?? branch)?.name ?? "Sucursal")
          : ((resolvedBranch.data ?? branch)?.name ?? "Sucursal"),
      }]
    : [];
  const profileDepartments = resolvedDepartmentId
    ? [{ id: resolvedDepartmentId, name: department?.name ?? fallbackDepartment?.name ?? "Departamento" }]
    : [];
  const profilePositions = (resolvedPositionId ?? positionById?.id ?? fallbackPositionRow?.id ?? legacyPositionId)
    ? [{ id: resolvedPositionId ?? positionById?.id ?? fallbackPositionRow?.id ?? legacyPositionId ?? "", department_id: resolvedDepartmentId ?? positionById?.department_id ?? fallbackPositionRow?.department_id ?? "", name: positionById?.name ?? resolvedEmployee?.position ?? fallbackPositionRow?.name ?? "Puesto", is_active: true }]
    : [];

  return (
    <EmployeeShell
      organizationId={tenant.organizationId}
      membershipId={tenant.membershipId}
      userId={user.id}
      employeeId={resolvedEmployee?.id ?? null}
      organizationName={organizationData?.name ?? "Empresa"}
      employeeName={employeeName}
      employeePosition={resolvedEmployee?.position ?? null}
      branchName={(() => {
        const b = resolvedBranch.data ?? branch;
        if (!b) return null;
        return customBrandingEnabled && b.city ? b.city : b.name;
      })()}
      departmentName={department?.name ?? fallbackDepartment?.name ?? null}
      docsCount={docsCount}
      checklistTemplateNames={checklistTemplateNames}
      enabledModules={{
        documents: isDocumentsEnabled,
        checklists: isChecklistEnabled,
        announcements: isAnnouncementsEnabled,
        onboarding: isOnboardingEnabled,
        ai_assistant: isAiAssistantEnabled,
      }}
      canDeleteDocuments={delegatedPermissions.documents.delete}
      canCreateChecklistReports={delegatedPermissions.checklists.create}
      customBrandingEnabled={customBrandingEnabled}
      companyLogoUrl={brandingSettings?.company_logo_url ?? ""}
      employeeProfile={employeeProfile}
      profileBranches={profileBranches}
      profileDepartments={profileDepartments}
      profilePositions={profilePositions}
      realtimeAccessToken={session?.access_token ?? null}
    >
      {children}
    </EmployeeShell>
  );
}
