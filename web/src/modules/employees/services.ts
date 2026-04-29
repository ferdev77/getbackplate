/* eslint-disable @typescript-eslint/no-explicit-any */
import { cache } from "react";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getEnabledModules } from "@/modules/organizations/queries";

export const getEmployeeDirectoryView = cache(async (
  organizationId: string, 
  limit: number = 1000, offset: number = 0,
  options: { includeModalsData?: boolean; includeUsersTab?: boolean; includeEmployeesData?: boolean } = {}
) => {
  const supabase = await createSupabaseServerClient();
  const includeEmployeesData = options.includeEmployeesData ?? true;

  const [
    { data: employees }, 
    { data: branches }, 
    { data: memberships }, 
    { data: roles }, 
    { data: departments }, 
    { data: positions }
  ] = await Promise.all([
    includeEmployeesData
      ? supabase
          .from("employees")
          .select(`
            id, user_id, first_name, last_name, email, phone, phone_country_code, position, department, department_id, status, branch_id, all_locations, location_scope_ids, hired_at, birth_date, sex, nationality, address_line1, address_city, address_state, address_postal_code, address_country, emergency_contact_name, emergency_contact_phone, emergency_contact_email, created_at,
            document_type, document_number, personal_email,
            branch:branches ( id, name ),
            dept:organization_departments ( id, name )
          `)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1)
      : Promise.resolve({ data: [] }),
    (options.includeModalsData || options.includeUsersTab)
      ? supabase
          .from("branches")
          .select("id, name, city")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
    options.includeUsersTab
      ? supabase
          .rpc("get_company_users", { lookup_organization_id: organizationId })
          .limit(limit * 2) // Buffer for generic users
      : Promise.resolve({ data: [] }),
    options.includeUsersTab
      ? supabase.from("roles").select("id, code")
      : Promise.resolve({ data: [] }),
    options.includeModalsData
      ? supabase
          .from("organization_departments")
          .select("id, name")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
    options.includeModalsData
      ? supabase
          .from("department_positions")
          .select("id, department_id, name, is_active")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
  ]);

  const employeeIds = (employees ?? []).map((emp) => emp.id);

  const [{ data: documents }, { data: contracts }, { data: employeeDocs }] = await Promise.all([
    options.includeModalsData && includeEmployeesData
      ? supabase
          .from("documents")
          .select("id, title, created_at")
.is('deleted_at', null)
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .limit(50)
      : Promise.resolve({ data: [] }),
    includeEmployeesData && employeeIds.length > 0 
      ? supabase
          .from("employee_contracts")
          .select("employee_id, contract_type, contract_status, start_date, end_date, notes, signer_name, salary_amount, salary_currency, payment_frequency, signed_at, created_at")
          .eq("organization_id", organizationId)
          .in("employee_id", employeeIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    includeEmployeesData && employeeIds.length > 0
      ? supabase
          .from("employee_documents")
          .select("employee_id, document_id, status, linked_document:documents(title)")
          .eq("organization_id", organizationId)
          .in("employee_id", employeeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const roleById = new Map((roles ?? []).map((row) => [row.id, row.code]));

  const enabledModules = await getEnabledModules(organizationId);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const mappedBranchList = (branches ?? []).map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  const branchById = new Map(mappedBranchList.map((row) => [row.id, row.name]));
  const departmentById = new Map((departments ?? []).map((row) => [row.id, row.name]));

  const documentById = new Map((documents ?? []).map((row) => [row.id, row]));
  const docsByEmployee = new Map<string, any[]>();
  const requiredDocumentSlots = ["photo", "id", "ssn", "rec1", "rec2", "other"] as const;
  const slotFromTitle: Array<{ prefix: string; slot: (typeof requiredDocumentSlots)[number] }> = [
    { prefix: "Foto del Empleado - ", slot: "photo" },
    { prefix: "ID / Identificacion - ", slot: "id" },
    { prefix: "SSN / EAD - ", slot: "ssn" },
    { prefix: "Numero de Seguro Social - ", slot: "ssn" },
    { prefix: "Food Handler Certificate - ", slot: "rec1" },
    { prefix: "Alcohol Server Certificate - ", slot: "rec2" },
    { prefix: "Food Protection Manager - ", slot: "other" },
    { prefix: "Carta de Recomendacion 1 - ", slot: "rec1" },
    { prefix: "Carta de Recomendacion 2 - ", slot: "rec2" },
    { prefix: "Otro Documento - ", slot: "other" },
  ];

  for (const ed of employeeDocs ?? []) {
    const docData = documentById.get(ed.document_id) || { id: ed.document_id, title: "Documento" };
    const linkedDoc = Array.isArray(ed.linked_document) ? ed.linked_document[0] : ed.linked_document;
    const linkedTitle = typeof linkedDoc?.title === "string" ? linkedDoc.title : null;

    let slotKey = null as string | null;
    if (linkedTitle) {
      slotKey = slotFromTitle.find((rule) => linkedTitle.startsWith(rule.prefix))?.slot ?? null;
    }
    
    if (!docsByEmployee.has(ed.employee_id)) {
      docsByEmployee.set(ed.employee_id, []);
    }
    docsByEmployee.get(ed.employee_id)!.push({
      ...docData,
      status: ed.status,
      slot_key: slotKey,
      employee_id: ed.employee_id
    });
  }

  const contractsByEmployee = new Map<string, any[]>();
  for (const c of contracts ?? []) {
    if (!contractsByEmployee.has(c.employee_id)) {
      contractsByEmployee.set(c.employee_id, []);
    }
    contractsByEmployee.get(c.employee_id)!.push(c);
  }

  const roleByUser = new Map<string, string>();
  for (const mb of memberships ?? []) {
    if (mb.role_id) {
      const roleCode = roleById.get(mb.role_id);
      if (roleCode) {
        roleByUser.set(mb.user_id, roleCode);
      }
    }
  }

  // Pre-process employees for mapping
  const mappedEmployees = (employees ?? [])
    .map((emp: any) => {
    let positionName = emp.position;
    let departmentName = emp.dept?.name || emp.department;

    if (!positionName && emp.department_id) {
      const positionMatches = (positions ?? []).filter(p => p.department_id === emp.department_id);
      if (positionMatches.length === 1) {
        positionName = positionMatches[0].name;
      }
    }

    if (!departmentName && emp.department_id) {
      departmentName = departmentById.get(emp.department_id) ?? undefined;
    } else if (positionName && !departmentName) {
      const matchingPos = (positions ?? []).find(p => p.name === positionName);
      if (matchingPos?.department_id) {
        departmentName = departmentById.get(matchingPos.department_id) ?? undefined;
      }
    }

    let positionId = undefined;
    if (positionName && departmentName && options.includeModalsData) {
       const matchingPos = (positions ?? []).find(p => p.name.toLowerCase() === positionName.toLowerCase() && p.department_id === emp.department_id);
       if (matchingPos) positionId = matchingPos.id;
    }

    const employeeDocs = docsByEmployee.get(emp.id) ?? [];
    const resolvedSlots = new Set(
      employeeDocs
        .filter((doc) => doc.slot_key && doc.status !== "rejected")
        .map((doc) => doc.slot_key),
    );
    const missingRequiredDocuments = requiredDocumentSlots.filter((slot) => !resolvedSlots.has(slot)).length;

    return {
      id: emp.id,
      userId: emp.user_id,
      firstName: emp.first_name,
      lastName: emp.last_name,
      email: emp.email,
      phone: emp.phone,
      phoneCountryCode: emp.phone_country_code,
      position: positionName,
      positionId,
      department: departmentName,
      departmentId: emp.department_id,
      status: emp.status,
      branchId: emp.branch_id,
      allLocations: emp.all_locations === true,
      locationScopeIds: Array.isArray(emp.location_scope_ids) ? emp.location_scope_ids.filter(Boolean) : [],
      branchName: (emp.branch_id ? branchById.get(emp.branch_id) : undefined) || emp.branch?.name,
      roleCode: emp.user_id ? roleByUser.get(emp.user_id) : undefined,
      hiredAt: emp.hired_at,
      birthDate: emp.birth_date,
      sex: emp.sex,
      nationality: emp.nationality,
      addressLine1: emp.address_line1,
      addressCity: emp.address_city,
      addressState: emp.address_state,
      addressPostalCode: emp.address_postal_code,
      addressCountry: emp.address_country,
      emergencyContactName: emp.emergency_contact_name,
      emergencyContactPhone: emp.emergency_contact_phone,
      emergencyContactEmail: emp.emergency_contact_email,
      createdAt: emp.created_at,
      personalEmail: emp.personal_email,
      documentType: emp.document_type,
      documentNumber: emp.document_number,
      contracts: contractsByEmployee.get(emp.id) ?? [],
      pendingDocuments: missingRequiredDocuments,
      completedDocumentsCount: (docsByEmployee.get(emp.id) ?? []).filter(d => d.status === "signed" || d.status === "approved").length,
      documentsCompletionStatus: missingRequiredDocuments === 0 ? "complete" : "incomplete",
    };
  });

  const validEmployeeUserIds = new Set(
    (employees ?? [])
      .filter((e: any) => e.user_id)
      .map((e: any) => e.user_id)
  );

  // Pre-process mapped generic system users
  const mappedUsers = (memberships ?? [])
    .filter((row: any) => !validEmployeeUserIds.has(row.user_id))
    .map((row: any) => {
    const roleCode = roleById.get(row.role_id);
    const rpcBranchName = typeof row.branch_name === "string" ? row.branch_name.trim() : "";
    const allLocations = row.all_locations === true || rpcBranchName.toLowerCase() === "todas las locaciones";
    return {
      membershipId: row.id,
      userId: row.user_id,
      fullName: row.full_name ?? "",
      email: row.email ?? "",
      roleCode: roleCode ?? "employee",
      status: row.status ?? "active",
      branchId: row.branch_id ?? null,
      allLocations,
      branchName: allLocations
        ? "Todas las locaciones"
        : (row.branch_id
          ? ((branchById.get(row.branch_id) ?? rpcBranchName) || "Locación")
          : (rpcBranchName || "Sin locación")),
      createdAt: row.created_at ?? "",
    };
  });


  return {
    employees: mappedEmployees,
    users: mappedUsers,
    documents: documents ?? [],
    branches: mappedBranchList,
    departments: departments ?? [],
    positions: positions ?? []
  };
});
