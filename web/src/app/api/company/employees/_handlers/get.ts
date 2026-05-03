import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { extractDisplayName } from "@/shared/lib/user";

import {
  DirectoryMembershipUser,
  resolveDocumentSlotFromTitle,
} from "./_shared";

export async function GET(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("employees");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const url = new URL(request.url);
  const catalog = url.searchParams.get("catalog");
  if (catalog !== "create_modal" && catalog !== "directory_page") {
    return NextResponse.json({ error: "Consulta no soportada" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = moduleAccess.tenant.organizationId;

  const [{ data: authData }, { data: customBrandingEnabled }, { data: organizationRow }, { data: branches }, { data: departments }, { data: positions }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const mappedBranches = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: customBrandingEnabled && branch.city ? branch.city : branch.name,
  }));

  if (catalog === "directory_page") {
    const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
    const pageRaw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
    const pageLimit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 20), 200) : 100;
    const pageNumber = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
    const offset = Math.max(0, (pageNumber - 1) * pageLimit);

    const viewData = await getEmployeeDirectoryView(organizationId, pageLimit, offset, {
      includeModalsData: false,
      includeUsersTab: true,
    });

    const { data: organizationUserProfiles } = await supabase
      .from("organization_user_profiles")
      .select("id, user_id, first_name, last_name, email, phone, branch_id, all_locations, location_scope_ids, department_id, is_employee, status, created_at")
      .eq("organization_id", organizationId)
      .eq("is_employee", false)
      .order("created_at", { ascending: false })
      .limit(pageLimit * 2);

    const { data: organizationMemberships } = await supabase
      .from("memberships")
      .select("user_id, status")
      .eq("organization_id", organizationId);

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
        .eq("organization_id", organizationId)
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
        const slot = resolveDocumentSlotFromTitle(typeof row.title === "string" ? row.title : null);
        if (!slot) continue;
        const accessScope = row.access_scope as { users?: unknown } | null;
        const users = Array.isArray(accessScope?.users)
          ? (accessScope?.users.filter((value): value is string => typeof value === "string") ?? [])
          : [];
        for (const userId of users) {
          if (!profileUserIds.includes(userId)) continue;
          if (!docIdsByUser.has(userId)) docIdsByUser.set(userId, new Set<string>());
          docIdsByUser.get(userId)!.add(row.id);
        }
      }
      for (const userId of profileUserIds) {
        userDocumentsCountByUserId.set(userId, docIdsByUser.get(userId)?.size ?? 0);
      }
    }

    const branchNameById = new Map((viewData.branches ?? []).map((b) => [b.id, b.name]));
    const departmentNameById = new Map((viewData.departments ?? []).map((d) => [d.id, d.name]));
    const membershipByUser = new Map<string, DirectoryMembershipUser>(
      ((viewData.users ?? []) as DirectoryMembershipUser[]).map((u) => [u.userId, u]),
    );

    const employeeRows = viewData.employees.map((emp) => {
      const defaultContract = emp.contracts?.[0];
      const resolvedLocationNames = emp.allLocations
        ? ["Todas las locaciones"]
        : (Array.isArray(emp.locationScopeIds) && emp.locationScopeIds.length
          ? emp.locationScopeIds.map((id) => branchNameById.get(id) ?? "Locación")
          : (emp.branchId
            ? [branchNameById.get(emp.branchId) ?? emp.branchName ?? "Locación"]
            : (emp.branchName ? [emp.branchName] : [])));
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
        branchName: resolvedLocationNames[0] ?? "Sin locación",
        locationNames: resolvedLocationNames,
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
        docsCompletionStatus: (emp.documentsCompletionStatus === "complete" ? "complete" : "incomplete") as "complete" | "incomplete",
        organizationUserProfileId: null,
      };
    });

    const userRows = (organizationUserProfiles ?? []).map((profile) => {
      const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim();
      const membership = profile.user_id ? membershipByUser.get(profile.user_id) : null;
      const resolvedLocationNames = profile.all_locations
        ? ["Todas las locaciones"]
        : (Array.isArray(profile.location_scope_ids) && profile.location_scope_ids.length
          ? profile.location_scope_ids.map((id) => branchNameById.get(id) ?? "Locación")
          : (profile.branch_id ? [branchNameById.get(profile.branch_id) ?? "Sin locación"] : []));

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
        branchName: resolvedLocationNames[0] ?? "Sin locación",
        locationNames: resolvedLocationNames,
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

    return NextResponse.json({
      employees: [...employeeRows, ...userRows],
      branches: mappedBranches,
      departments: departments ?? [],
      positions: positions ?? [],
      publisherName: extractDisplayName(authData.user),
      companyName: organizationRow?.name ?? "la empresa",
    });
  }

  return NextResponse.json({
    branches: mappedBranches,
    departments: departments ?? [],
    positions: positions ?? [],
    publisherName: extractDisplayName(authData.user),
    companyName: organizationRow?.name ?? "la empresa",
  });
}
