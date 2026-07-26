import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";

const EXPECTED_PROJECT_REF = "uubdslmtfxwraszinpao";
const PRODUCTION_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("RLS verification refused: expected Supabase dev project");
}
if (databaseUrl.includes(PRODUCTION_PROJECT_REF) || apiUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("RLS verification refused: production project detected");
}

const ids = {
  admin: randomUUID(),
  employeeA: randomUUID(),
  employeeMismatch: randomUUID(),
  employeeOutOfScope: randomUUID(),
  employeeB: randomUUID(),
  organizationA: randomUUID(),
  organizationB: randomUUID(),
  branchA: randomUUID(),
  branchA2: randomUUID(),
  branchB: randomUUID(),
  departmentA: randomUUID(),
  departmentMismatch: randomUUID(),
  departmentB: randomUUID(),
  positionA: randomUUID(),
  positionMismatch: randomUUID(),
  positionB: randomUUID(),
  employeeRowA: randomUUID(),
  employeeRowMismatch: randomUUID(),
  employeeRowOutOfScope: randomUUID(),
  employeeRowB: randomUUID(),
  contractA: randomUUID(),
  contractMismatch: randomUUID(),
  contractOutOfScope: randomUUID(),
  contractB: randomUUID(),
  documentAndScope: randomUUID(),
  documentDirectUser: randomUUID(),
  documentBranchOnly: randomUUID(),
};

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

async function asUser(userId, callback) {
  await client.query("set local role authenticated");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  await client.query("select set_config('request.jwt.claim.role', 'authenticated', true)");
  try {
    return await callback();
  } finally {
    await client.query("reset role");
  }
}

async function visibleIds(table, userId, organizationId) {
  return asUser(userId, async () => {
    const { rows } = await client.query(
      `select id from public.${pg.escapeIdentifier(table)} where organization_id = $1 order by id`,
      [organizationId],
    );
    return rows.map((row) => row.id);
  });
}

async function canReadDocument(userId, documentId) {
  return asUser(userId, async () => {
    const { rows } = await client.query(
      "select exists(select 1 from public.documents where id = $1) as allowed",
      [documentId],
    );
    return rows[0].allowed;
  });
}

async function createFixtures() {
  const instanceId = "00000000-0000-0000-0000-000000000000";
  const users = [ids.admin, ids.employeeA, ids.employeeMismatch, ids.employeeOutOfScope, ids.employeeB];
  for (const [index, userId] of users.entries()) {
    await client.query(`
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values ($1, $2, 'authenticated', 'authenticated', $3, '', now(), '{}', '{}', now(), now(), '', '', '', '')
    `, [instanceId, userId, `rls-${index}-${userId}@getbackplate.test`]);
  }

  const { rows: roles } = await client.query(
    "select id, code from public.roles where code in ('company_admin', 'employee')",
  );
  const roleByCode = Object.fromEntries(roles.map((role) => [role.code, role.id]));
  assert.ok(roleByCode.company_admin, "company_admin role is required");
  assert.ok(roleByCode.employee, "employee role is required");

  await client.query(`
    insert into public.organizations (id, name, slug, created_by)
    values ($1, 'RLS Isolated A', $2, $3), ($4, 'RLS Isolated B', $5, $3)
  `, [ids.organizationA, `rls-a-${ids.organizationA}`, ids.admin, ids.organizationB, `rls-b-${ids.organizationB}`]);
  await client.query(`
    insert into public.branches (id, organization_id, code, name)
    values ($1,$2,'A1','A1'), ($3,$2,'A2','A2'), ($4,$5,'B1','B1')
  `, [ids.branchA, ids.organizationA, ids.branchA2, ids.branchB, ids.organizationB]);
  await client.query(`
    insert into public.organization_departments (id, organization_id, code, name, created_by)
    values ($1,$2,'A','Kitchen',$3), ($4,$2,'A-M','Service',$3), ($5,$6,'B','Kitchen',$3)
  `, [ids.departmentA, ids.organizationA, ids.admin, ids.departmentMismatch, ids.departmentB, ids.organizationB]);
  await client.query(`
    insert into public.department_positions (id, organization_id, department_id, code, name, created_by)
    values ($1,$2,$3,'CHEF','Chef',$4), ($5,$2,$6,'SERVER','Server',$4), ($7,$8,$9,'CHEF','Chef',$4)
  `, [ids.positionA, ids.organizationA, ids.departmentA, ids.admin, ids.positionMismatch, ids.departmentMismatch, ids.positionB, ids.organizationB, ids.departmentB]);
  await client.query(`
    insert into public.memberships (organization_id, user_id, role_id, branch_id, status)
    values
      ($1,$2,$3,$4,'active'), ($1,$5,$6,$4,'active'), ($1,$7,$6,$4,'active'),
      ($1,$8,$6,$9,'active'), ($10,$11,$6,$12,'active')
  `, [ids.organizationA, ids.admin, roleByCode.company_admin, ids.branchA, ids.employeeA, roleByCode.employee, ids.employeeMismatch, ids.employeeOutOfScope, ids.branchA2, ids.organizationB, ids.employeeB, ids.branchB]);
  await client.query(`
    insert into public.employees (id, organization_id, branch_id, user_id, first_name, last_name, position, department, department_id)
    values
      ($1,$2,$3,$4,'Employee','A','Chef','Kitchen',$5),
      ($6,$2,$3,$7,'Employee','Mismatch','Server','Service',$8),
      ($9,$2,$10,$11,'Employee','Out of scope','Chef','Kitchen',$5),
      ($12,$13,$14,$15,'Employee','B','Chef','Kitchen',$16)
  `, [ids.employeeRowA, ids.organizationA, ids.branchA, ids.employeeA, ids.departmentA, ids.employeeRowMismatch, ids.employeeMismatch, ids.departmentMismatch, ids.employeeRowOutOfScope, ids.branchA2, ids.employeeOutOfScope, ids.employeeRowB, ids.organizationB, ids.branchB, ids.employeeB, ids.departmentB]);
  await client.query(`
    insert into public.employee_contracts (id, organization_id, employee_id, contract_type, contract_status, salary_amount, salary_currency)
    values
      ($1,$2,$3,'full_time','active',100,'USD'),
      ($4,$2,$5,'full_time','active',200,'USD'),
      ($6,$2,$7,'full_time','active',250,'USD'),
      ($8,$9,$10,'full_time','active',300,'USD')
  `, [ids.contractA, ids.organizationA, ids.employeeRowA, ids.contractMismatch, ids.employeeRowMismatch, ids.contractOutOfScope, ids.employeeRowOutOfScope, ids.contractB, ids.organizationB, ids.employeeRowB]);
  await client.query(`
    insert into public.employee_module_permissions (
      organization_id, membership_id, module_code, can_view, granted_by
    )
    select $1, membership.id, 'employees', true, $2
    from public.memberships membership
    where membership.organization_id = $1 and membership.user_id = $3
  `, [ids.organizationA, ids.admin, ids.employeeMismatch]);

  const andScope = JSON.stringify({
    users: [],
    locations: [ids.branchA, ids.branchA2],
    department_ids: [ids.departmentA],
    position_ids: [ids.positionA],
  });
  const directScope = JSON.stringify({ users: [ids.employeeA], locations: [], department_ids: [], position_ids: [] });
  await client.query(`
    insert into public.documents (id, organization_id, branch_id, owner_user_id, title, file_path, status, access_scope)
    values
      ($1,$2,$3,$4,'AND scope','rls/and-scope.pdf','active',$5::jsonb),
      ($6,$2,null,$4,'Direct user','rls/direct-user.pdf','active',$7::jsonb),
      ($8,$2,$3,$4,'Branch only','rls/branch-only.pdf','active','{}'::jsonb)
  `, [ids.documentAndScope, ids.organizationA, ids.branchA, ids.admin, andScope, ids.documentDirectUser, directScope, ids.documentBranchOnly]);
}

async function verify() {
  assert.deepEqual(await visibleIds("employees", ids.employeeA, ids.organizationA), [ids.employeeRowA]);
  assert.deepEqual(await visibleIds("employees", ids.admin, ids.organizationA).then((items) => items.sort()), [ids.employeeRowA, ids.employeeRowMismatch, ids.employeeRowOutOfScope].sort());
  assert.deepEqual(await visibleIds("employees", ids.employeeMismatch, ids.organizationA).then((items) => items.sort()), [ids.employeeRowA, ids.employeeRowMismatch].sort());
  assert.deepEqual(await visibleIds("employees", ids.employeeOutOfScope, ids.organizationA), [ids.employeeRowOutOfScope]);
  assert.deepEqual(await visibleIds("employees", ids.employeeB, ids.organizationA), []);

  assert.deepEqual(await visibleIds("employee_contracts", ids.employeeA, ids.organizationA), [ids.contractA]);
  assert.deepEqual(await visibleIds("employee_contracts", ids.admin, ids.organizationA).then((items) => items.sort()), [ids.contractA, ids.contractMismatch, ids.contractOutOfScope].sort());
  assert.deepEqual(await visibleIds("employee_contracts", ids.employeeMismatch, ids.organizationA).then((items) => items.sort()), [ids.contractA, ids.contractMismatch].sort());
  assert.deepEqual(await visibleIds("employee_contracts", ids.employeeOutOfScope, ids.organizationA), [ids.contractOutOfScope]);
  assert.deepEqual(await visibleIds("employee_contracts", ids.employeeB, ids.organizationA), []);

  assert.equal(await canReadDocument(ids.employeeA, ids.documentAndScope), true, "all populated dimensions should match");
  assert.equal(await canReadDocument(ids.employeeMismatch, ids.documentAndScope), false, "one matching dimension must not bypass the others");
  assert.equal(await canReadDocument(ids.employeeA, ids.documentDirectUser), true, "direct user scope should grant access");
  assert.equal(await canReadDocument(ids.employeeMismatch, ids.documentDirectUser), false, "direct user scope must remain private");
  assert.equal(await canReadDocument(ids.employeeA, ids.documentBranchOnly), true, "legacy branch-only documents should remain visible in the assigned branch");
  assert.equal(await canReadDocument(ids.employeeB, ids.documentBranchOnly), false, "branch-only documents must remain tenant isolated");

  await asUser(ids.employeeB, async () => {
    const companyUsers = await client.query("select * from public.get_company_users($1)", [ids.organizationA]);
    assert.equal(companyUsers.rowCount, 0, "users must not enumerate another tenant");

    const tenantContext = await client.query(
      "select * from public.get_tenant_access_context($1, $2, 'documents')",
      [ids.admin, ids.organizationA],
    );
    assert.equal(tenantContext.rowCount, 0, "users must not request another user's tenant context");

    const employeeContext = await client.query(
      "select * from public.get_employee_access_context($1, $2)",
      [ids.admin, ids.organizationA],
    );
    assert.equal(employeeContext.rowCount, 0, "users must not request another user's employee context");

    const documentCount = await client.query(
      "select public.count_accessible_documents($1, $2, 'company_admin', null, null, '{}') as count",
      [ids.organizationA, ids.admin],
    );
    assert.equal(documentCount.rows[0].count, 0, "users must not spoof document count inputs");
  });

  const privilegedFunctions = [
    "public.increment_invoice_balance(uuid,integer)",
    "public.increment_r365_slots(uuid,integer)",
    "public.apply_r365_connection_purchase(uuid)",
    "public.cleanup_ai_assistant_data(integer,integer,integer)",
    "public.get_user_id_by_email(text)",
    "public.create_employee_transaction(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text,timestamp with time zone,date,text,text,text,text,text,text,text,text,text,text,text,boolean,uuid,text,text,text,date,date,numeric,text,text,text,text,timestamp with time zone,jsonb)",
    "public.submit_checklist_transaction(uuid,uuid,uuid,uuid,uuid,jsonb,timestamp with time zone)",
  ];
  for (const signature of privilegedFunctions) {
    const { rows } = await client.query(`
      select
        has_function_privilege('anon', $1, 'execute') as anon,
        has_function_privilege('authenticated', $1, 'execute') as authenticated,
        has_function_privilege('service_role', $1, 'execute') as service_role
    `, [signature]);
    assert.equal(rows[0].anon, false, `${signature} must not be executable by anon`);
    assert.equal(rows[0].authenticated, false, `${signature} must not be executable by authenticated`);
    assert.equal(rows[0].service_role, true, `${signature} must be executable by service_role`);
  }

  const { rows: directoryPrivileges } = await client.query(`
    select
      has_function_privilege('anon', 'public.get_company_users(uuid)', 'execute') as anon,
      has_function_privilege('authenticated', 'public.get_company_users(uuid)', 'execute') as authenticated
  `);
  assert.equal(directoryPrivileges[0].anon, false, "get_company_users must not be executable by anon");
  assert.equal(directoryPrivileges[0].authenticated, true, "get_company_users is used by authenticated admins");
}

await client.connect();
try {
  await client.query("begin");
  await client.query("set local statement_timeout = '30s'");
  await createFixtures();
  await verify();
  console.log("RLS dev verification passed: isolated HR, contracts, document scopes, and privileged RPC grants.");
} finally {
  await client.query("rollback");
  try {
    const { rows } = await client.query(`
      select
        (select count(*)::int from public.organizations where name like 'RLS Isolated %') as organizations,
        (select count(*)::int from auth.users where email like 'rls-%@getbackplate.test') as users
    `);
    assert.deepEqual(rows[0], { organizations: 0, users: 0 }, "RLS fixtures must be fully rolled back");
  } finally {
    await client.end();
  }
}
