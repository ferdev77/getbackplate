import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { getEmployeeDirectoryView } from "@/modules/employees/services";
import { extractDisplayName } from "@/shared/lib/user";
import {
  assertPlanLimitForEmployees,
  assertPlanLimitForUsers,
  getPlanLimitErrorMessage,
} from "@/shared/lib/plan-limits";
import { provisionOrganizationUserAccount } from "@/shared/lib/user-provisioning.service";
import {
  rollbackEmployeeCreateFlow,
  syncEmployeeProfileProjection,
  upsertEmployeeContractDocument,
} from "@/modules/employees/services/company-employees-route-support";
import { EMPLOYEES_MESSAGES } from "@/shared/lib/employees-messages";

const emailSchema = z.string().email();
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const ALLOWED_CREATE_MODES = new Set(["without_account", "with_account"]);
const ALLOWED_CONTRACT_STATUSES = new Set(["draft", "active", "ended", "cancelled"]);
const ALLOWED_EMPLOYMENT_STATUSES = new Set(["active", "inactive", "vacation", "leave"]);
const ALLOWED_DOCUMENT_TYPES = new Set(["dni", "cuil", "ssn", "passport"]);

// Returns the set of branch IDs this HR employee can manage.
// null means "all locations" (no filter needed).
async function resolveHrScope(
  organizationId: string,
  userId: string,
): Promise<string[] | null> {
  const admin = createSupabaseAdminClient();
  const { data: actor } = await admin
    .from("employees")
    .select("all_locations, location_scope_ids, branch_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!actor || actor.all_locations) return null;

  const ids = Array.from(
    new Set([
      ...(Array.isArray(actor.location_scope_ids) ? actor.location_scope_ids : []),
      ...(actor.branch_id ? [actor.branch_id] : []),
    ]),
  );
  return ids.length ? ids : null;
}

function isEmployeeInScope(
  emp: { branch_id?: string | null; location_scope_ids?: string[] | null; all_locations?: boolean | null },
  scopeIds: string[] | null,
): boolean {
  if (!scopeIds) return true;
  if (emp.all_locations) return true;
  const empBranches = Array.from(
    new Set([
      ...(emp.branch_id ? [emp.branch_id] : []),
      ...(Array.isArray(emp.location_scope_ids) ? emp.location_scope_ids : []),
    ]),
  );
  return empBranches.some((id) => scopeIds.includes(id));
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const access = await assertEmployeeCapabilityApi("employees", "view");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { tenant, userId } = access;
  const organizationId = tenant.organizationId;
  const url = new URL(request.url);
  const catalog = url.searchParams.get("catalog");

  if (catalog !== "create_modal" && catalog !== "directory_page") {
    return NextResponse.json({ error: "Consulta no soportada" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, { data: customBrandingEnabled }, { data: organizationRow }, { data: branches }, { data: departments }, { data: positions }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    supabase.from("branches").select("id, name, city").eq("organization_id", organizationId).eq("is_active", true).order("name"),
    supabase.from("organization_departments").select("id, name").eq("organization_id", organizationId).eq("is_active", true).order("name"),
    supabase.from("department_positions").select("id, department_id, name, is_active").eq("organization_id", organizationId).eq("is_active", true).order("name"),
  ]);

  const mappedBranches = (branches ?? []).map((b) => ({
    id: b.id,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  if (catalog === "create_modal") {
    return NextResponse.json({
      branches: mappedBranches,
      departments: departments ?? [],
      positions: positions ?? [],
      publisherName: extractDisplayName(authData.user),
      companyName: organizationRow?.name ?? "la empresa",
    });
  }

  // directory_page: list employees filtered by HR scope
  const limitRaw = Number.parseInt(url.searchParams.get("limit") ?? "100", 10);
  const pageRaw = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const pageLimit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 20), 200) : 100;
  const pageNumber = Number.isFinite(pageRaw) ? Math.max(pageRaw, 1) : 1;
  const offset = Math.max(0, (pageNumber - 1) * pageLimit);

  const scopeIds = await resolveHrScope(organizationId, userId);

  const viewData = await getEmployeeDirectoryView(organizationId, pageLimit * 3, offset, {
    includeModalsData: false,
    includeUsersTab: false,
  });

  const { data: organizationMemberships } = await supabase
    .from("memberships")
    .select("user_id, status")
    .eq("organization_id", organizationId);

  const activeMembershipUserIds = new Set(
    (organizationMemberships ?? []).filter((m) => m.status === "active").map((m) => m.user_id),
  );

  const branchNameById = new Map((viewData.branches ?? []).map((b) => [b.id, b.name]));
  const activeBranchIds = new Set((viewData.branches ?? []).map((b) => b.id));

  const hasFullBranchCoverage = (ids: string[] | null | undefined) => {
    if (!Array.isArray(ids) || ids.length === 0 || activeBranchIds.size === 0) return false;
    const normalized = Array.from(new Set(ids.filter(Boolean)));
    if (normalized.length !== activeBranchIds.size) return false;
    return normalized.every((id) => activeBranchIds.has(id));
  };

  const employeeRows = viewData.employees
    .filter((emp) => isEmployeeInScope({ branch_id: emp.branchId, location_scope_ids: emp.locationScopeIds, all_locations: emp.allLocations }, scopeIds))
    .map((emp) => {
      const defaultContract = emp.contracts?.[0];
      const isAllLocations = emp.allLocations || hasFullBranchCoverage(emp.locationScopeIds);
      const resolvedLocationNames = isAllLocations
        ? ["Todas las locaciones"]
        : (Array.isArray(emp.locationScopeIds) && emp.locationScopeIds.length
          ? emp.locationScopeIds.map((id) => branchNameById.get(id) ?? "Locación")
          : (emp.branchId ? [branchNameById.get(emp.branchId) ?? emp.branchName ?? "Locación"] : (emp.branchName ? [emp.branchName] : [])));
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
        pendingDocuments: 0,
        docsCompletionStatus: "incomplete" as const,
        organizationUserProfileId: null,
      };
    });

  return NextResponse.json({
    employees: employeeRows,
    branches: mappedBranches,
    departments: departments ?? [],
    positions: positions ?? [],
    publisherName: extractDisplayName(authData.user),
    companyName: organizationRow?.name ?? "la empresa",
  });
}

// ─── POST (create / edit employee) ───────────────────────────────────────────

export async function POST(request: Request) {
  const formData = await request.formData();
  const employeeId = String(formData.get("employee_id") ?? "").trim() || null;
  const isEditMode = Boolean(employeeId);

  const capability = isEditMode ? "edit" : "create";
  const access = await assertEmployeeCapabilityApi("employees", capability);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { tenant, userId: actorId } = access;
  const organizationId = tenant.organizationId;
  const supabase = await createSupabaseServerClient();

  // ── Parse form data ──
  const firstName = String(formData.get("first_name") ?? "").trim();
  const lastName = String(formData.get("last_name") ?? "").trim();
  const positionId = String(formData.get("position_id") ?? "").trim() || null;
  let position = String(formData.get("position") ?? "").trim() || null;
  let departmentId = String(formData.get("department_id") ?? "").trim() || null;
  let department: string | null = null;
  const rawBranchValue = String(formData.get("branch_id") ?? "").trim();
  const branchScopeValues = formData.getAll("branch_ids").map((v) => String(v ?? "").trim()).filter(Boolean);
  const requestedBranchScopeIds = Array.from(new Set(branchScopeValues));
  const allLocations = rawBranchValue === "__all__";
  const locationScopeIds = allLocations
    ? []
    : Array.from(new Set([...(rawBranchValue ? [rawBranchValue] : []), ...requestedBranchScopeIds]));
  const branchId = allLocations ? null : (locationScopeIds[0] ?? null);
  let branchName: string | null = null;
  const email = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const employmentStatusInput = String(formData.get("employment_status") ?? formData.get("status") ?? "").trim();
  const hiredAt = String(formData.get("hired_at") ?? formData.get("hire_date") ?? "").trim() || null;
  const createMode = String(formData.get("create_mode") ?? "without_account").trim();
  const isEmployeeProfile = String(formData.get("is_employee") ?? "yes").trim().toLowerCase() !== "no";
  const existingDashboardAccess = String(formData.get("existing_dashboard_access") ?? "no").trim().toLowerCase() === "yes";
  const accountEmailInput = String(formData.get("account_email") ?? "").trim().toLowerCase();
  const accountPassword = String(formData.get("account_password") ?? "");
  const birthDate = String(formData.get("birth_date") ?? "").trim() || null;
  const documentType = String(formData.get("document_type") ?? "").trim().toLowerCase() || null;
  const documentNumber = String(formData.get("document_number") ?? "").trim() || null;
  const sex = String(formData.get("sex") ?? "").trim() || null;
  const nationality = String(formData.get("nationality") ?? "").trim() || null;
  const phoneCountryCode = String(formData.get("phone_country_code") ?? "").trim() || null;
  const addressLine1 = String(formData.get("address_line1") ?? formData.get("address") ?? "").trim() || null;
  const contractType = String(formData.get("contract_type") ?? "").trim() || null;
  const contractStatus = String(formData.get("contract_status") ?? "draft").trim() || "draft";
  const contractStart = String(formData.get("contract_start_date") ?? "").trim() || null;
  const contractEnd = String(formData.get("contract_end_date") ?? "").trim() || null;
  const salaryAmountRaw = String(formData.get("salary_amount") ?? "").trim();
  const salaryCurrency = String(formData.get("salary_currency") ?? "").trim() || null;
  const paymentFrequency = String(formData.get("payment_frequency") ?? "").trim() || null;
  const contractNotes = String(formData.get("contract_notes") ?? "").trim() || null;
  const contractSignerName = String(formData.get("contract_signer_name") ?? "").trim() || null;
  const contractSignedAt = String(formData.get("contract_signed_at") ?? "").trim() || null;

  // ── Validate HR employee's scope ──
  const scopeIds = await resolveHrScope(organizationId, actorId);
  if (scopeIds !== null) {
    const newBranches = allLocations ? [] : locationScopeIds;
    const branchesOutOfScope = newBranches.filter((id) => !scopeIds.includes(id));
    if (branchesOutOfScope.length > 0) {
      return NextResponse.json({ error: "No tenés permisos para asignar empleados a esas locaciones" }, { status: 403 });
    }
  }

  if (isEditMode && employeeId) {
    const { data: targetEmp } = await supabase
      .from("employees")
      .select("branch_id, location_scope_ids, all_locations")
      .eq("organization_id", organizationId)
      .eq("id", employeeId)
      .maybeSingle();

    if (!targetEmp) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
    }
    if (!isEmployeeInScope(targetEmp, scopeIds)) {
      return NextResponse.json({ error: "No tenés permisos para editar este empleado" }, { status: 403 });
    }
  }

  // ── Input validation ──
  if (!firstName || !lastName || !email || !phone) {
    return NextResponse.json({ error: "Nombre, apellido, teléfono y email son obligatorios" }, { status: 400 });
  }
  if (!isEditMode && !ALLOWED_CREATE_MODES.has(createMode)) {
    return NextResponse.json({ error: "Modo de creación inválido" }, { status: 400 });
  }
  if (email && !emailSchema.safeParse(email).success) {
    return NextResponse.json({ error: "Email de empleado inválido" }, { status: 400 });
  }
  if (accountEmailInput && !emailSchema.safeParse(accountEmailInput).success) {
    return NextResponse.json({ error: "Email de acceso inválido" }, { status: 400 });
  }
  for (const dateValue of [hiredAt, birthDate, contractStart, contractEnd, contractSignedAt]) {
    if (dateValue && !dateOnlySchema.safeParse(dateValue).success) {
      return NextResponse.json({ error: "Formato de fecha inválido (usa YYYY-MM-DD)" }, { status: 400 });
    }
  }
  if (!ALLOWED_CONTRACT_STATUSES.has(contractStatus)) {
    return NextResponse.json({ error: "Estado de contrato inválido" }, { status: 400 });
  }
  const normalizedEmploymentStatus = employmentStatusInput || "active";
  if (employmentStatusInput && !ALLOWED_EMPLOYMENT_STATUSES.has(normalizedEmploymentStatus)) {
    return NextResponse.json({ error: "Estado laboral inválido" }, { status: 400 });
  }
  if (documentType && !ALLOWED_DOCUMENT_TYPES.has(documentType)) {
    return NextResponse.json({ error: "Tipo de documento inválido" }, { status: 400 });
  }

  if (!isEditMode && isEmployeeProfile) {
    try {
      await assertPlanLimitForEmployees(organizationId, 1);
    } catch (error) {
      return NextResponse.json(
        { error: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_EMPLOYEES) },
        { status: 400 },
      );
    }
  }

  // ── Validate branch / department / position ──
  const { data: organizationRow } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
  const companyName = organizationRow?.name ?? "la empresa";

  if (locationScopeIds.length) {
    const { data: branchRows, error: branchError } = await supabase
      .from("branches")
      .select("id, name")
      .eq("organization_id", organizationId)
      .in("id", locationScopeIds);

    if (branchError) {
      return NextResponse.json({ error: "Locación no válida para esta empresa" }, { status: 400 });
    }
    const validIds = new Set((branchRows ?? []).map((r) => r.id));
    if (locationScopeIds.some((id) => !validIds.has(id))) {
      return NextResponse.json({ error: "Una o más locaciones no son válidas para esta empresa" }, { status: 400 });
    }
    branchName = (branchRows ?? [])[0]?.name ?? null;
  }

  if (departmentId) {
    const { data: deptRow, error: deptError } = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (deptError || !deptRow) {
      return NextResponse.json({ error: "Departamento no válido para esta empresa" }, { status: 400 });
    }
    department = deptRow.name;
  }

  if (positionId) {
    const { data: posRow, error: posError } = await supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", organizationId)
      .eq("id", positionId)
      .eq("is_active", true)
      .maybeSingle();

    if (posError || !posRow) {
      return NextResponse.json({ error: "Puesto no válido para esta empresa" }, { status: 400 });
    }
    if (departmentId && departmentId !== posRow.department_id) {
      return NextResponse.json({ error: "El puesto no pertenece al departamento seleccionado" }, { status: 400 });
    }
    departmentId = posRow.department_id;
    position = posRow.name;

    const { data: posDepRow, error: posDepError } = await supabase
      .from("organization_departments")
      .select("name")
      .eq("organization_id", organizationId)
      .eq("id", departmentId)
      .eq("is_active", true)
      .maybeSingle();

    if (posDepError || !posDepRow) {
      return NextResponse.json({ error: "Departamento no válido para el puesto seleccionado" }, { status: 400 });
    }
    department = posDepRow.name;
  }

  const salaryAmount = salaryAmountRaw ? parseFloat(salaryAmountRaw) : null;
  const validSalaryAmount = Number.isFinite(salaryAmount) && (salaryAmount ?? 0) > 0 ? salaryAmount : null;

  const admin = createSupabaseAdminClient();
  let linkedUserId: string | null = null;
  let createdAuthUserId: string | null = null;
  let createdMembershipForLinkedUser = false;
  const resolvedEmployeeId: string | null = employeeId;

  // ── Employee profile flow ──
  if (isEmployeeProfile) {
    let upsertedEmployeeId: string | null = null;

    if (isEditMode && employeeId) {
      const { data: existingEmployee } = await admin
        .from("employees")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("id", employeeId)
        .maybeSingle();

      linkedUserId = existingEmployee?.user_id ?? null;

      const { error: updateError } = await admin
        .from("employees")
        .update({
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          phone_country_code: phoneCountryCode,
          position,
          department,
          department_id: departmentId,
          branch_id: branchId,
          all_locations: allLocations,
          location_scope_ids: locationScopeIds,
          status: normalizedEmploymentStatus,
          hired_at: hiredAt,
          birth_date: birthDate,
          document_type: documentType,
          document_number: documentNumber,
          sex,
          nationality,
          address_line1: addressLine1,
        })
        .eq("organization_id", organizationId)
        .eq("id", employeeId);

      if (updateError) {
        return NextResponse.json({ error: `No se pudo actualizar el empleado: ${updateError.message}` }, { status: 400 });
      }
      upsertedEmployeeId = employeeId;
    } else {
      const { data: insertedEmployee, error: insertError } = await admin
        .from("employees")
        .insert({
          organization_id: organizationId,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          phone_country_code: phoneCountryCode,
          position,
          department,
          department_id: departmentId,
          branch_id: branchId,
          all_locations: allLocations,
          location_scope_ids: locationScopeIds,
          status: normalizedEmploymentStatus,
          hired_at: hiredAt,
          birth_date: birthDate,
          document_type: documentType,
          document_number: documentNumber,
          sex,
          nationality,
          address_line1: addressLine1,
        })
        .select("id")
        .single();

      if (insertError || !insertedEmployee) {
        return NextResponse.json({ error: `No se pudo crear el empleado: ${insertError?.message ?? "error"}` }, { status: 400 });
      }
      upsertedEmployeeId = insertedEmployee.id;
    }

    if (!upsertedEmployeeId) {
      return NextResponse.json({ error: "No se pudo resolver el ID del empleado" }, { status: 400 });
    }

    // ── Account provisioning ──
    if (createMode === "with_account") {
      const loginEmail = accountEmailInput || email || "";
      const needsProvision = !linkedUserId || !existingDashboardAccess;

      if (needsProvision) {
        const provisionResult = await provisionOrganizationUserAccount({
          admin,
          organizationId,
          loginEmail,
          accountPassword,
          firstName,
          lastName,
        });

        if (!provisionResult.ok) {
          if (!isEditMode) {
            await rollbackEmployeeCreateFlow({
              organizationId,
              employeeId: upsertedEmployeeId,
              uploadedPaths: [],
              uploadedDocumentIds: [],
              linkedUserId: null,
              createdMembershipForLinkedUser: false,
              createdAuthUserId: null,
            });
          }
          return NextResponse.json({ error: provisionResult.error }, { status: 400 });
        }

        if (!isEditMode) createdAuthUserId = provisionResult.userId;
        linkedUserId = provisionResult.userId;
      }

      if (!linkedUserId) {
        return NextResponse.json({ error: EMPLOYEES_MESSAGES.AUTH_USER_UNRESOLVED }, { status: 400 });
      }

      const { data: role, error: roleError } = await admin.from("roles").select("id").eq("code", "employee").single();
      if (roleError || !role) {
        return NextResponse.json({ error: EMPLOYEES_MESSAGES.ROLE_EMPLOYEE_UNAVAILABLE }, { status: 400 });
      }

      const { data: existingMembership } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", linkedUserId)
        .maybeSingle();

      if (!existingMembership) {
        try {
          await assertPlanLimitForUsers(organizationId, 1);
        } catch (error) {
          return NextResponse.json({ error: getPlanLimitErrorMessage(error, EMPLOYEES_MESSAGES.PLAN_LIMIT_USERS) }, { status: 400 });
        }
      }

      const { data: membershipRow, error: membershipError } = await admin
        .from("memberships")
        .upsert(
          {
            organization_id: organizationId,
            user_id: linkedUserId,
            role_id: role.id,
            branch_id: branchId,
            all_locations: allLocations,
            location_scope_ids: locationScopeIds,
            status: "active",
          },
          { onConflict: "organization_id,user_id" },
        )
        .select("id")
        .single();

      if (membershipError || !membershipRow) {
        if (!isEditMode) {
          await rollbackEmployeeCreateFlow({
            organizationId,
            employeeId: upsertedEmployeeId,
            uploadedPaths: [],
            uploadedDocumentIds: [],
            linkedUserId,
            createdMembershipForLinkedUser,
            createdAuthUserId,
          });
        }
        return NextResponse.json({ error: `No se pudo asignar acceso al usuario: ${membershipError?.message ?? "error"}` }, { status: 400 });
      }

      createdMembershipForLinkedUser = !existingMembership;

      // Update employee with user_id
      await admin
        .from("employees")
        .update({ user_id: linkedUserId })
        .eq("organization_id", organizationId)
        .eq("id", upsertedEmployeeId);
    }

    // ── Sync profile projection ──
    await syncEmployeeProfileProjection({
      organizationId,
      employeeId: upsertedEmployeeId,
      userId: linkedUserId,
      branchId,
      allLocations,
      locationScopeIds,
      departmentId,
      positionId,
      firstName,
      lastName,
      email: email ?? "",
      phone,
      employeeStatus: normalizedEmploymentStatus,
    });

    // ── Contract ──
    if (contractType) {
      const { data: existingContract } = await admin
        .from("employee_contracts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("employee_id", upsertedEmployeeId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const contractPayload = {
        organization_id: organizationId,
        employee_id: upsertedEmployeeId,
        contract_type: contractType,
        contract_status: contractStatus,
        start_date: contractStart,
        end_date: contractEnd,
        salary_amount: validSalaryAmount,
        salary_currency: salaryCurrency,
        payment_frequency: paymentFrequency,
        notes: contractNotes,
        signer_name: contractSignerName,
        signed_at: contractSignedAt,
      };

      if (existingContract) {
        await admin
          .from("employee_contracts")
          .update(contractPayload)
          .eq("organization_id", organizationId)
          .eq("id", existingContract.id);
      } else {
        await admin.from("employee_contracts").insert(contractPayload);
      }

      if (linkedUserId) {
        try {
          await upsertEmployeeContractDocument({
            organizationId,
            companyName,
            actorId,
            employeeId: upsertedEmployeeId,
            linkedUserId,
            firstName,
            lastName,
            branchId,
            branchName,
            departmentId,
            departmentName: department,
            positionName: position,
            hiredAt,
            contractType,
            paymentFrequency,
            salaryAmount: validSalaryAmount,
            salaryCurrency,
          });
        } catch {
          // non-fatal: contract doc is best-effort
        }
      }
    }

    await logAuditEvent({
      action: isEditMode ? "employee.update" : "employee.create",
      entityType: "employee",
      entityId: upsertedEmployeeId,
      organizationId,
      eventDomain: "employees",
      outcome: "success",
      severity: "low",
      actorId,
      metadata: { via: "hr_delegation" },
    });

    return NextResponse.json({ ok: true, employeeId: upsertedEmployeeId });
  }

  return NextResponse.json({ error: "Solo se permite gestionar perfiles de empleado desde este portal" }, { status: 400 });
}

// ─── PATCH (status update) ────────────────────────────────────────────────────

export async function PATCH(request: Request) {
  const access = await assertEmployeeCapabilityApi("employees", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { tenant, userId: actorId } = access;
  const organizationId = tenant.organizationId;
  const supabase = await createSupabaseServerClient();
  const scopeIds = await resolveHrScope(organizationId, actorId);

  const body = await request.json().catch(() => null) as {
    employeeId?: string;
    status?: string;
  } | null;

  const employeeId = String(body?.employeeId ?? "").trim();
  const status = String(body?.status ?? "").trim();

  if (!employeeId) {
    return NextResponse.json({ error: "Registro inválido" }, { status: 400 });
  }
  if (!ALLOWED_EMPLOYMENT_STATUSES.has(status)) {
    return NextResponse.json({ error: "Estado inválido" }, { status: 400 });
  }

  const { data: previousEmployee } = await supabase
    .from("employees")
    .select("status, branch_id, location_scope_ids, all_locations")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!previousEmployee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
  if (!isEmployeeInScope(previousEmployee, scopeIds)) {
    return NextResponse.json({ error: "No tenés permisos para editar este empleado" }, { status: 403 });
  }

  const { error } = await supabase
    .from("employees")
    .update({ status })
    .eq("organization_id", organizationId)
    .eq("id", employeeId);

  if (error) {
    return NextResponse.json({ error: `No se pudo actualizar estado: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "employee.status.update",
    entityType: "employee",
    entityId: employeeId,
    organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "low",
    actorId,
    metadata: { previous_status: previousEmployee.status, next_status: status, via: "hr_delegation" },
  });

  return NextResponse.json({ ok: true });
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: Request) {
  const access = await assertEmployeeCapabilityApi("employees", "delete");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { tenant, userId: actorId } = access;
  const organizationId = tenant.organizationId;
  const supabase = await createSupabaseServerClient();
  const scopeIds = await resolveHrScope(organizationId, actorId);

  const body = await request.json().catch(() => null) as {
    employeeId?: string;
  } | null;

  const employeeId = String(body?.employeeId ?? "").trim();
  if (!employeeId) {
    return NextResponse.json({ error: "Registro inválido" }, { status: 400 });
  }

  const { data: employee } = await supabase
    .from("employees")
    .select("id, user_id, branch_id, location_scope_ids, all_locations")
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) {
    return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
  }
  if (!isEmployeeInScope(employee, scopeIds)) {
    return NextResponse.json({ error: "No tenés permisos para eliminar este empleado" }, { status: 403 });
  }

  const { data: deletedEmployees, error: deleteError } = await supabase
    .from("employees")
    .delete()
    .eq("organization_id", organizationId)
    .eq("id", employeeId)
    .select("id");

  if (deleteError) {
    return NextResponse.json({ error: `No se pudo eliminar empleado: ${deleteError.message}` }, { status: 400 });
  }
  if (!deletedEmployees || deletedEmployees.length === 0) {
    return NextResponse.json({ error: "No se encontró el registro del empleado o faltan permisos para eliminarlo." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  if (employee.user_id) {
    await admin.from("memberships").delete().eq("organization_id", organizationId).eq("user_id", employee.user_id);
  }
  await admin.from("organization_user_profiles").delete().eq("organization_id", organizationId).eq("employee_id", employeeId);

  await logAuditEvent({
    action: "employee.delete",
    entityType: "employee",
    entityId: employeeId,
    organizationId,
    eventDomain: "employees",
    outcome: "success",
    severity: "medium",
    actorId,
    metadata: { via: "hr_delegation" },
  });

  return NextResponse.json({ ok: true });
}
