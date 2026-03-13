import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getOrCreateAuthUser(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`No se pudo listar usuarios auth: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) break;
    page += 1;
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: "GetBackplate#123",
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`No se pudo crear usuario auth ${email}: ${createError?.message ?? "error"}`);
  }

  return created.user;
}

async function getRoleIdByCode(client, code) {
  const { rows } = await client.query(`select id from public.roles where code = $1 limit 1`, [code]);
  return rows[0]?.id ?? null;
}

async function ensureUserMembership(client, organizationId, userId, roleId) {
  await client.query(
    `insert into public.memberships (organization_id, user_id, role_id, status)
     values ($1,$2,$3,'active')
     on conflict (organization_id, user_id)
     do update set role_id = excluded.role_id, status = 'active'`,
    [organizationId, userId, roleId],
  );
}

async function hasCompanyPanelAccess(client, organizationId, userId) {
  const { rows } = await client.query(
    `
    select exists (
      select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.organization_id = $1
        and m.user_id = $2
        and m.status = 'active'
        and r.code in ('company_admin', 'manager')
    ) as allowed
    `,
    [organizationId, userId],
  );

  return Boolean(rows[0]?.allowed);
}

async function hasEmployeePortalAccess(client, organizationId, userId) {
  const { rows } = await client.query(
    `
    select exists (
      select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.organization_id = $1
        and m.user_id = $2
        and m.status = 'active'
        and r.code = 'employee'
    ) as allowed
    `,
    [organizationId, userId],
  );

  return Boolean(rows[0]?.allowed);
}

async function hasManageRoleScope(client, organizationId, userId) {
  const { rows } = await client.query(
    `
    select exists (
      select 1
      from public.memberships m
      join public.roles r on r.id = m.role_id
      where m.organization_id = $1
        and m.user_id = $2
        and m.status = 'active'
        and r.code in ('company_admin', 'manager')
    ) as allowed
    `,
    [organizationId, userId],
  );

  return Boolean(rows[0]?.allowed);
}

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows: orgRows } = await client.query(
      `select id, name from public.organizations where status = 'active' order by created_at asc limit 1`,
    );
    const org = orgRows[0];
    if (!org) {
      throw new Error("No hay organizaciones activas para validar permisos por rol.");
    }

    const roleCompanyAdminId = await getRoleIdByCode(client, "company_admin");
    const roleManagerId = await getRoleIdByCode(client, "manager");
    const roleEmployeeId = await getRoleIdByCode(client, "employee");

    if (!roleCompanyAdminId || !roleManagerId || !roleEmployeeId) {
      throw new Error("Faltan roles base (company_admin, manager, employee).");
    }

    const companyAdminUser = await getOrCreateAuthUser("role.company.admin@getbackplate.local");
    const managerUser = await getOrCreateAuthUser("role.manager@getbackplate.local");
    const employeeUser = await getOrCreateAuthUser("role.employee@getbackplate.local");

    await ensureUserMembership(client, org.id, companyAdminUser.id, roleCompanyAdminId);
    await ensureUserMembership(client, org.id, managerUser.id, roleManagerId);
    await ensureUserMembership(client, org.id, employeeUser.id, roleEmployeeId);

    const matrix = [
      {
        label: "company_admin",
        userId: companyAdminUser.id,
        expectedManageScope: true,
        expectedCompanyPanel: true,
        expectedEmployeePortal: false,
      },
      {
        label: "manager",
        userId: managerUser.id,
        expectedManageScope: true,
        expectedCompanyPanel: true,
        expectedEmployeePortal: false,
      },
      {
        label: "employee",
        userId: employeeUser.id,
        expectedManageScope: false,
        expectedCompanyPanel: false,
        expectedEmployeePortal: true,
      },
    ];

    const results = [];

    let hasFailures = false;

    for (const row of matrix) {
      const manageScope = await hasManageRoleScope(client, org.id, row.userId);
      const companyPanel = await hasCompanyPanelAccess(client, org.id, row.userId);
      const employeePortal = await hasEmployeePortalAccess(client, org.id, row.userId);

      const ok =
        manageScope === row.expectedManageScope &&
        companyPanel === row.expectedCompanyPanel &&
        employeePortal === row.expectedEmployeePortal;

      results.push({
        role: row.label,
        manage_scope: manageScope,
        company_panel: companyPanel,
        employee_portal: employeePortal,
        expected_manage_scope: row.expectedManageScope,
        expected_company_panel: row.expectedCompanyPanel,
        expected_employee_portal: row.expectedEmployeePortal,
        ok,
      });

      if (!ok) {
        hasFailures = true;
      }
    }

    console.table(results);

    if (hasFailures) {
      throw new Error("Matriz de permisos invalida para uno o mas roles");
    }

    console.log(`OK: permisos por rol validados en org ${org.name} (${org.id}).`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("ERROR verify-role-permissions:", error.message);
  process.exit(1);
});
