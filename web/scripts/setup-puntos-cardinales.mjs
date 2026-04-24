import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_PASSWORD = process.env.CARDINALES_PASSWORD ?? "12120204";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG = {
  name: "Puntos Cardinales",
  slug: "puntos-cardinales",
  status: "active",
};

const BRANCHES = [
  { code: "este", name: "Este" },
  { code: "oeste", name: "Oeste" },
  { code: "norte", name: "Norte" },
  { code: "sur", name: "Sur" },
];

const DEPARTMENTS = [
  { code: "back_of_house", name: "Back of house", positions: ["cocinero", "bachero"] },
  { code: "front_of_house", name: "Front of house", positions: ["mesero", "cafetero"] },
  { code: "operativo", name: "Operativo", positions: ["gerente", "encargado"] },
];

const ADMIN_USERS = ["fer@cardinal.com", "angelo@cardinal.com"];
const EMPLOYEE_USERS = ["uno@cardinal.com", "dos@cardinal.com", "tres@cardinal.com", "cuatro@cardinal.com"];

function titleCase(word) {
  if (!word) return "";
  return `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function deriveNames(email) {
  const local = email.split("@")[0] ?? "user";
  const clean = local.replace(/[^a-zA-Z0-9._-]/g, "");
  return {
    first_name: titleCase(clean),
    last_name: "Cardinales",
  };
}

async function findUserByEmail(email) {
  let page = 1;
  const perPage = 200;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.listUsers(${email}): ${error.message}`);
    const found = (data?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (found) return found;
    if ((data?.users ?? []).length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(email, password) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw new Error(`auth.updateUserById(${email}): ${error.message}`);
    return existing;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`auth.createUser(${email}): ${error.message}`);
  if (!data?.user) throw new Error(`auth.createUser(${email}): user not returned`);
  return data.user;
}

async function fetchSingle(table, query) {
  const { data, error } = await query(supabase.from(table));
  if (error) throw new Error(`${table}: ${error.message}`);
  return data;
}

async function upsertOrgCodeRow(table, organizationId, row) {
  const code = row.code;
  if (!code) throw new Error(`${table} upsertOrgCodeRow requires code`);

  const { data: existing, error: existingError } = await supabase
    .from(table)
    .select("id")
    .eq("organization_id", organizationId)
    .eq("code", code)
    .maybeSingle();
  if (existingError) throw new Error(`${table} preselect(${code}): ${existingError.message}`);

  if (existing?.id) {
    const { error } = await supabase
      .from(table)
      .update({ ...row, organization_id: organizationId })
      .eq("id", existing.id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(`${table} update(${code}): ${error.message}`);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from(table)
    .insert({ ...row, organization_id: organizationId })
    .select("id")
    .single();
  if (insertError) throw new Error(`${table} insert(${code}): ${insertError.message}`);
  return inserted.id;
}

async function upsertDepartmentPosition(organizationId, departmentId, row) {
  const code = row.code;
  const { data: existing, error: existingError } = await supabase
    .from("department_positions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("department_id", departmentId)
    .eq("code", code)
    .maybeSingle();
  if (existingError) throw new Error(`department_positions preselect(${code}): ${existingError.message}`);

  const payload = {
    ...row,
    organization_id: organizationId,
    department_id: departmentId,
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("department_positions")
      .update(payload)
      .eq("id", existing.id)
      .eq("organization_id", organizationId);
    if (error) throw new Error(`department_positions update(${code}): ${error.message}`);
    return existing.id;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("department_positions")
    .insert(payload)
    .select("id")
    .single();
  if (insertError) throw new Error(`department_positions insert(${code}): ${insertError.message}`);
  return inserted.id;
}

async function upsertOrgUserProfile(profile) {
  const { data: existing, error: existingError } = await supabase
    .from("organization_user_profiles")
    .select("id")
    .eq("organization_id", profile.organization_id)
    .eq("user_id", profile.user_id)
    .maybeSingle();
  if (existingError) {
    throw new Error(`organization_user_profiles preselect(${profile.email}): ${existingError.message}`);
  }

  if (existing?.id) {
    const { error } = await supabase
      .from("organization_user_profiles")
      .update(profile)
      .eq("id", existing.id)
      .eq("organization_id", profile.organization_id);
    if (error) throw new Error(`organization_user_profiles update(${profile.email}): ${error.message}`);
    return;
  }

  const { error } = await supabase.from("organization_user_profiles").insert(profile);
  if (error) throw new Error(`organization_user_profiles insert(${profile.email}): ${error.message}`);
}

async function main() {
  const plan = await fetchSingle("plans", (q) => q.select("id").eq("code", "custom").maybeSingle());
  let planId = plan?.id ?? null;

  if (!planId) {
    const { data, error } = await supabase
      .from("plans")
      .insert({
        code: "custom",
        name: "Custom",
        description: "Plan personalizado",
        is_active: true,
      })
      .select("id")
      .single();
    if (error) throw new Error(`plans insert custom: ${error.message}`);
    planId = data.id;
  }

  const [companyAdminRole, employeeRole] = await Promise.all([
    fetchSingle("roles", (q) => q.select("id").eq("code", "company_admin").single()),
    fetchSingle("roles", (q) => q.select("id").eq("code", "employee").single()),
  ]);

  const adminAuthUsers = [];
  for (const email of ADMIN_USERS) {
    adminAuthUsers.push(await ensureAuthUser(email, DEFAULT_PASSWORD));
  }

  const employeeAuthUsers = [];
  for (const email of EMPLOYEE_USERS) {
    employeeAuthUsers.push(await ensureAuthUser(email, DEFAULT_PASSWORD));
  }

  const orgPayload = {
    name: ORG.name,
    slug: ORG.slug,
    status: ORG.status,
    plan_id: planId,
    created_by: adminAuthUsers[0].id,
  };

  let org = await fetchSingle("organizations", (q) => q.select("id").eq("slug", ORG.slug).maybeSingle());
  if (!org) {
    org = await fetchSingle("organizations", (q) => q.insert(orgPayload).select("id").single());
  } else {
    const { error } = await supabase.from("organizations").update(orgPayload).eq("id", org.id);
    if (error) throw new Error(`organizations update: ${error.message}`);
  }

  const orgId = org.id;

  const { error: limitsError } = await supabase.from("organization_limits").upsert(
    {
      organization_id: orgId,
      max_branches: 50,
      max_users: 200,
      max_storage_mb: 51200,
      max_employees: 1000,
    },
    { onConflict: "organization_id" },
  );
  if (limitsError) throw new Error(`organization_limits upsert: ${limitsError.message}`);

  const { error: settingsError } = await supabase.from("organization_settings").upsert(
    {
      organization_id: orgId,
      timezone: "America/New_York",
      updated_by: adminAuthUsers[0].id,
    },
    { onConflict: "organization_id" },
  );
  if (settingsError) throw new Error(`organization_settings upsert: ${settingsError.message}`);

  const { data: modules, error: modulesError } = await supabase.from("module_catalog").select("id");
  if (modulesError) throw new Error(`module_catalog select: ${modulesError.message}`);
  if (modules?.length) {
    const { error: orgModulesError } = await supabase.from("organization_modules").upsert(
      modules.map((m) => ({
        organization_id: orgId,
        module_id: m.id,
        is_enabled: true,
        enabled_at: new Date().toISOString(),
      })),
      { onConflict: "organization_id,module_id" },
    );
    if (orgModulesError) throw new Error(`organization_modules upsert: ${orgModulesError.message}`);
  }

  for (const branch of BRANCHES) {
    await upsertOrgCodeRow("branches", orgId, { ...branch, is_active: true });
  }

  const { data: branchRows, error: branchRowsError } = await supabase
    .from("branches")
    .select("id,code")
    .eq("organization_id", orgId);
  if (branchRowsError) throw new Error(`branches select: ${branchRowsError.message}`);
  const branchIdByCode = new Map((branchRows ?? []).map((b) => [b.code, b.id]));

  for (const dep of DEPARTMENTS) {
    await upsertOrgCodeRow("organization_departments", orgId, {
      code: dep.code,
      name: dep.name,
      is_active: true,
      created_by: adminAuthUsers[0].id,
    });
  }

  const { data: depRows, error: depRowsError } = await supabase
    .from("organization_departments")
    .select("id,code,name")
    .eq("organization_id", orgId);
  if (depRowsError) throw new Error(`organization_departments select: ${depRowsError.message}`);
  const depIdByCode = new Map((depRows ?? []).map((d) => [d.code, d.id]));

  const positionsPayload = [];
  for (const dep of DEPARTMENTS) {
    const depId = depIdByCode.get(dep.code);
    if (!depId) throw new Error(`Missing department id for code=${dep.code}`);
    for (const positionName of dep.positions) {
      positionsPayload.push({
        organization_id: orgId,
        department_id: depId,
        code: positionName.toLowerCase().replace(/\s+/g, "_"),
        name: titleCase(positionName),
        is_active: true,
        created_by: adminAuthUsers[0].id,
      });
    }
  }

  for (const pos of positionsPayload) {
    await upsertDepartmentPosition(orgId, pos.department_id, {
      code: pos.code,
      name: pos.name,
      is_active: pos.is_active,
      created_by: pos.created_by,
      description: null,
    });
  }

  const { data: positionRows, error: positionRowsError } = await supabase
    .from("department_positions")
    .select("id,department_id,code,name")
    .eq("organization_id", orgId);
  if (positionRowsError) throw new Error(`department_positions select: ${positionRowsError.message}`);

  const positionIdByDepAndCode = new Map(
    (positionRows ?? []).map((p) => [`${p.department_id}:${p.code}`, p.id]),
  );

  const adminMemberships = adminAuthUsers.map((u, idx) => ({
    organization_id: orgId,
    user_id: u.id,
    role_id: companyAdminRole.id,
    branch_id: branchIdByCode.get(BRANCHES[idx % BRANCHES.length].code) ?? null,
    status: "active",
  }));

  const employeeAssignments = [
    { branchCode: "este", depCode: "back_of_house", posCode: "cocinero", employeeCode: "PC-EMP-001" },
    { branchCode: "oeste", depCode: "front_of_house", posCode: "mesero", employeeCode: "PC-EMP-002" },
    { branchCode: "norte", depCode: "operativo", posCode: "encargado", employeeCode: "PC-EMP-003" },
    { branchCode: "sur", depCode: "front_of_house", posCode: "cafetero", employeeCode: "PC-EMP-004" },
  ];

  const employeeMemberships = employeeAuthUsers.map((u, idx) => ({
    organization_id: orgId,
    user_id: u.id,
    role_id: employeeRole.id,
    branch_id: branchIdByCode.get(employeeAssignments[idx].branchCode) ?? null,
    status: "active",
  }));

  const { error: membershipsError } = await supabase
    .from("memberships")
    .upsert([...adminMemberships, ...employeeMemberships], { onConflict: "organization_id,user_id" });
  if (membershipsError) throw new Error(`memberships upsert: ${membershipsError.message}`);

  const employeeUpserts = employeeAuthUsers.map((u, idx) => {
    const assignment = employeeAssignments[idx];
    const depId = depIdByCode.get(assignment.depCode) ?? null;
    const branchId = branchIdByCode.get(assignment.branchCode) ?? null;
    const positionCode = assignment.posCode.replace(/\s+/g, "_").toLowerCase();
    const names = deriveNames(EMPLOYEE_USERS[idx]);

    return {
      organization_id: orgId,
      user_id: u.id,
      employee_code: assignment.employeeCode,
      first_name: names.first_name,
      last_name: names.last_name,
      email: EMPLOYEE_USERS[idx],
      personal_email: EMPLOYEE_USERS[idx],
      status: "active",
      branch_id: branchId,
      department_id: depId,
      department: DEPARTMENTS.find((d) => d.code === assignment.depCode)?.name ?? null,
      position: titleCase(assignment.posCode),
    };
  });

  const { data: existingEmployees, error: existingEmployeesError } = await supabase
    .from("employees")
    .select("id,user_id")
    .eq("organization_id", orgId)
    .in("user_id", employeeAuthUsers.map((u) => u.id));
  if (existingEmployeesError) throw new Error(`employees preselect: ${existingEmployeesError.message}`);
  const existingByUserId = new Map((existingEmployees ?? []).map((e) => [e.user_id, e.id]));

  for (const employee of employeeUpserts) {
    const existingId = existingByUserId.get(employee.user_id);
    if (existingId) {
      const { error } = await supabase
        .from("employees")
        .update(employee)
        .eq("id", existingId)
        .eq("organization_id", orgId);
      if (error) throw new Error(`employees update(${employee.email}): ${error.message}`);
    } else {
      const { error } = await supabase.from("employees").insert(employee);
      if (error) throw new Error(`employees insert(${employee.email}): ${error.message}`);
    }
  }

  const { data: employeeRows, error: employeeRowsError } = await supabase
    .from("employees")
    .select("id,user_id,department_id")
    .eq("organization_id", orgId)
    .in("user_id", employeeAuthUsers.map((u) => u.id));
  if (employeeRowsError) throw new Error(`employees postselect: ${employeeRowsError.message}`);
  const employeeByUserId = new Map((employeeRows ?? []).map((e) => [e.user_id, e]));

  const adminProfiles = adminAuthUsers.map((u, idx) => {
    const names = deriveNames(ADMIN_USERS[idx]);
    return {
      organization_id: orgId,
      user_id: u.id,
      employee_id: null,
      branch_id: branchIdByCode.get(BRANCHES[idx % BRANCHES.length].code) ?? null,
      department_id: null,
      position_id: null,
      first_name: names.first_name,
      last_name: names.last_name,
      email: ADMIN_USERS[idx],
      is_employee: false,
      source: "seed_puntos_cardinales",
    };
  });

  const employeeProfiles = employeeAuthUsers.map((u, idx) => {
    const assignment = employeeAssignments[idx];
    const names = deriveNames(EMPLOYEE_USERS[idx]);
    const depId = depIdByCode.get(assignment.depCode) ?? null;
    const posCode = assignment.posCode.toLowerCase().replace(/\s+/g, "_");
    const posId = depId ? positionIdByDepAndCode.get(`${depId}:${posCode}`) ?? null : null;
    const employeeRow = employeeByUserId.get(u.id);

    return {
      organization_id: orgId,
      user_id: u.id,
      employee_id: employeeRow?.id ?? null,
      branch_id: branchIdByCode.get(assignment.branchCode) ?? null,
      department_id: depId,
      position_id: posId,
      first_name: names.first_name,
      last_name: names.last_name,
      email: EMPLOYEE_USERS[idx],
      is_employee: true,
      source: "seed_puntos_cardinales",
    };
  });

  for (const profile of [...adminProfiles, ...employeeProfiles]) {
    await upsertOrgUserProfile(profile);
  }

  console.log("OK setup Puntos Cardinales");
  console.log(`- Project: ${SUPABASE_URL}`);
  console.log(`- Organization: ${ORG.name} (${ORG.slug})`);
  console.log(`- Plan: custom (${planId})`);
  console.log(`- Branches: ${BRANCHES.length}`);
  console.log(`- Departments: ${DEPARTMENTS.length}`);
  console.log(`- Positions: ${DEPARTMENTS.reduce((acc, d) => acc + d.positions.length, 0)}`);
  console.log(`- Admin users: ${ADMIN_USERS.length}`);
  console.log(`- Employee users: ${EMPLOYEE_USERS.length}`);
}

main().catch((error) => {
  console.error("ERROR setup-puntos-cardinales:", error.message);
  process.exit(1);
});
