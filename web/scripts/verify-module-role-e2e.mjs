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
        and r.code in ('company_admin')
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

async function isModuleEnabled(client, organizationId, moduleCode) {
  const { rows } = await client.query(
    `select public.is_module_enabled($1::uuid, $2::text) as enabled`,
    [organizationId, moduleCode],
  );
  return Boolean(rows[0]?.enabled);
}

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows: orgRows } = await client.query(
      `
      select id, name
      from public.organizations
      where status = 'active'
      order by case when slug = 'smoke-optional-modules' then 0 else 1 end, created_at asc
      limit 1
      `,
    );
    const org = orgRows[0];
    if (!org) {
      throw new Error("No hay organizaciones activas para validar e2e de modulos por rol.");
    }

    const roleCompanyAdminId = await getRoleIdByCode(client, "company_admin");
    const roleEmployeeId = await getRoleIdByCode(client, "employee");

    if (!roleCompanyAdminId || !roleEmployeeId) {
      throw new Error("Faltan roles base (company_admin, employee).");
    }

    const companyAdminUser = await getOrCreateAuthUser("e2e.module.admin@getbackplate.local");
    const employeeUser = await getOrCreateAuthUser("e2e.module.employee@getbackplate.local");

    await ensureUserMembership(client, org.id, companyAdminUser.id, roleCompanyAdminId);
    await ensureUserMembership(client, org.id, employeeUser.id, roleEmployeeId);

    await client.query("begin");
    try {
      await client.query(
        `
        update public.organization_modules om
        set is_enabled = false, enabled_at = null
        from public.module_catalog mc
        where om.organization_id = $1
          and om.module_id = mc.id
          and mc.code = 'announcements'
        `,
        [org.id],
      );

      await client.query(
        `
        update public.organization_modules om
        set is_enabled = true, enabled_at = timezone('utc', now())
        from public.module_catalog mc
        where om.organization_id = $1
          and om.module_id = mc.id
          and mc.code = 'documents'
        `,
        [org.id],
      );

      const documentsEnabled = await isModuleEnabled(client, org.id, "documents");
      const announcementsEnabled = await isModuleEnabled(client, org.id, "announcements");

      if (!documentsEnabled || announcementsEnabled) {
        throw new Error("No se pudo preparar estado ON/OFF de modulos para la prueba e2e.");
      }

      const matrix = [
        {
          role: "company_admin",
          userId: companyAdminUser.id,
          expected: {
            appDocuments: true,
            appAnnouncements: false,
            portalDocuments: false,
          },
        },
        {
          role: "employee",
          userId: employeeUser.id,
          expected: {
            appDocuments: false,
            appAnnouncements: false,
            portalDocuments: true,
          },
        },
      ];

      const results = [];
      let hasFailures = false;

      for (const row of matrix) {
        const companyAccess = await hasCompanyPanelAccess(client, org.id, row.userId);
        const employeePortalAccess = await hasEmployeePortalAccess(client, org.id, row.userId);

        const actual = {
          appDocuments: companyAccess && documentsEnabled,
          appAnnouncements: companyAccess && announcementsEnabled,
          portalDocuments: employeePortalAccess && documentsEnabled,
        };

        const ok =
          actual.appDocuments === row.expected.appDocuments &&
          actual.appAnnouncements === row.expected.appAnnouncements &&
          actual.portalDocuments === row.expected.portalDocuments;

        results.push({
          role: row.role,
          app_documents: actual.appDocuments,
          app_announcements: actual.appAnnouncements,
          portal_documents: actual.portalDocuments,
          expected_app_documents: row.expected.appDocuments,
          expected_app_announcements: row.expected.appAnnouncements,
          expected_portal_documents: row.expected.portalDocuments,
          ok,
        });

        if (!ok) {
          hasFailures = true;
        }
      }

      console.table(results);

      if (hasFailures) {
        throw new Error("La matriz e2e ON/OFF por rol no coincide con el contrato esperado.");
      }

      console.log(`OK: e2e de modulos ON/OFF por rol validado en ${org.name} (${org.id}).`);
    } finally {
      await client.query("rollback");
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("ERROR verify-module-role-e2e:", error.message);
  process.exit(1);
});
