import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationPaths = [
  path.resolve(
    __dirname,
    "../../supabase/migrations/202603120001_harden_document_rls.sql",
  ),
  path.resolve(
    __dirname,
    "../../supabase/migrations/202603120002_harden_checklist_rls.sql",
  ),
  path.resolve(
    __dirname,
    "../../supabase/migrations/202603120003_harden_announcement_rls.sql",
  ),
];

async function applyMigration(client) {
  await client.query("begin");
  try {
    for (const migrationPath of migrationPaths) {
      const sql = await readFile(migrationPath, "utf8");
      await client.query(sql);
    }
    await client.query("commit");
    console.log("OK: migraciones 202603120001 + 202603120002 + 202603120003 aplicadas.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function findTestUsers(client) {
  const { rows } = await client.query(`
    select
      e.organization_id,
      e.id as employee_id,
      e.user_id,
      e.branch_id,
      e.department_id
    from public.employees e
    where e.user_id is not null
    order by e.organization_id, e.created_at asc
  `);

  const byOrg = new Map();
  for (const row of rows) {
    const list = byOrg.get(row.organization_id) ?? [];
    list.push(row);
    byOrg.set(row.organization_id, list);
  }

  for (const [organizationId, employees] of byOrg.entries()) {
    if (employees.length >= 2) {
      return {
        organizationId,
        actorA: employees[0],
        actorB: employees[1],
      };
    }
  }

  return null;
}

async function getOrCreateAuthUser(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`No se pudo listar usuarios auth: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      return found;
    }

    if (data.users.length < perPage) {
      break;
    }

    page += 1;
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "GetBackplate#123",
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error(`No se pudo crear usuario auth ${email}: ${createError?.message ?? "error"}`);
  }

  return created.user;
}

async function ensureTestUsers(client) {
  const { rows: orgRows } = await client.query(
    `select id from public.organizations order by created_at asc limit 1`,
  );
  const organizationId = orgRows[0]?.id;

  if (!organizationId) {
    throw new Error("No hay organizaciones disponibles para la prueba de aislamiento.");
  }

  const { rows: roleRows } = await client.query(
    `select id from public.roles where code = 'employee' limit 1`,
  );
  const employeeRoleId = roleRows[0]?.id;

  if (!employeeRoleId) {
    throw new Error("No existe rol 'employee' para crear usuarios de prueba.");
  }

  const userA = await getOrCreateAuthUser("rls.testa@getbackplate.local");
  const userB = await getOrCreateAuthUser("rls.testb@getbackplate.local");

  await client.query(
    `insert into public.memberships (organization_id, user_id, role_id, status)
     values ($1,$2,$3,'active')
     on conflict (organization_id, user_id)
     do update set role_id = excluded.role_id, status = 'active'`,
    [organizationId, userA.id, employeeRoleId],
  );

  await client.query(
    `insert into public.memberships (organization_id, user_id, role_id, status)
     values ($1,$2,$3,'active')
     on conflict (organization_id, user_id)
     do update set role_id = excluded.role_id, status = 'active'`,
    [organizationId, userB.id, employeeRoleId],
  );

  await client.query(
    `insert into public.employees (organization_id, user_id, first_name, last_name, status)
     select $1,$2,'RLS','Tester A','active'
     where not exists (
       select 1 from public.employees where organization_id = $1 and user_id = $2
     )`,
    [organizationId, userA.id],
  );

  await client.query(
    `insert into public.employees (organization_id, user_id, first_name, last_name, status)
     select $1,$2,'RLS','Tester B','active'
     where not exists (
       select 1 from public.employees where organization_id = $1 and user_id = $2
     )`,
    [organizationId, userB.id],
  );

  console.log("OK: usuarios de prueba RLS preparados (rls.testa / rls.testb).");
}

async function canReadAsUser(client, userId, document) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  const { rows } = await client.query(
    `select public.can_read_document($1::uuid, $2::uuid, $3::jsonb, $4::uuid) as allowed`,
    [
      document.organization_id,
      document.branch_id,
      JSON.stringify(document.access_scope ?? {}),
      document.id,
    ],
  );
  return Boolean(rows[0]?.allowed);
}

async function canReadTemplateAsUser(client, userId, template) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  const { rows } = await client.query(
    `select public.can_read_checklist_template($1::uuid, $2::uuid, $3::uuid, $4::jsonb) as allowed`,
    [
      template.organization_id,
      template.branch_id,
      template.department_id,
      JSON.stringify(template.target_scope ?? {}),
    ],
  );
  return Boolean(rows[0]?.allowed);
}

async function canSubmitTemplateAsUser(client, userId, organizationId, templateId) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  const { rows } = await client.query(
    `select public.can_submit_checklist($1::uuid, $2::uuid, $3::uuid) as allowed`,
    [organizationId, templateId, userId],
  );
  return Boolean(rows[0]?.allowed);
}

async function canReadAnnouncementAsUser(client, userId, announcement) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  const { rows } = await client.query(
    `select public.can_read_announcement($1::uuid, $2::uuid, $3::uuid, $4::jsonb) as allowed`,
    [
      announcement.organization_id,
      announcement.id,
      announcement.branch_id,
      JSON.stringify(announcement.target_scope ?? {}),
    ],
  );
  return Boolean(rows[0]?.allowed);
}

async function verifyIsolation(client) {
  let testUsers = await findTestUsers(client);

  if (!testUsers) {
    await ensureTestUsers(client);
    testUsers = await findTestUsers(client);
  }

  if (!testUsers) {
    throw new Error("No fue posible obtener 2 empleados con user_id para validar aislamiento.");
  }

  const { organizationId, actorA, actorB } = testUsers;

  await client.query("begin");
  try {
    const { rows: insertedDocs } = await client.query(
      `insert into public.documents (
         organization_id,
         branch_id,
         owner_user_id,
         title,
         file_path,
         mime_type,
         file_size_bytes,
         access_scope,
         status
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'active')
       returning id, organization_id, branch_id, access_scope`,
      [
        organizationId,
        actorA.branch_id,
        actorA.user_id,
        "RLS TEST - Documento privado por usuario",
        `rls-tests/${organizationId}/${Date.now()}-private-user-doc.pdf`,
        "application/pdf",
        1024,
        JSON.stringify({
          users: [actorA.user_id],
          locations: [],
          department_ids: [],
        }),
      ],
    );

    const document = insertedDocs[0];

    await client.query(
      `insert into public.employee_documents (organization_id, employee_id, document_id, status)
       values ($1,$2,$3,'approved')
       on conflict (employee_id, document_id) do nothing`,
      [organizationId, actorA.employee_id, document.id],
    );

    const allowA = await canReadAsUser(client, actorA.user_id, document);
    const allowB = await canReadAsUser(client, actorB.user_id, document);

    if (!allowA) {
      throw new Error("Fallo validacion: actor A deberia poder leer su documento asignado.");
    }

    if (allowB) {
      throw new Error("Fallo validacion: actor B NO deberia poder leer documento privado de actor A.");
    }

    const { rows: insertedTemplates } = await client.query(
      `insert into public.checklist_templates (
         organization_id,
         branch_id,
         name,
         checklist_type,
         is_active,
         target_scope,
         created_by
       )
       values ($1,$2,$3,'custom',true,$4::jsonb,$5)
       returning id, organization_id, branch_id, department_id, target_scope`,
      [
        organizationId,
        actorA.branch_id,
        "RLS TEST - Checklist privado por usuario",
        JSON.stringify({
          users: [actorA.user_id],
          locations: [],
          department_ids: [],
        }),
        actorA.user_id,
      ],
    );

    const checklistTemplate = insertedTemplates[0];
    const canReadChecklistA = await canReadTemplateAsUser(client, actorA.user_id, checklistTemplate);
    const canReadChecklistB = await canReadTemplateAsUser(client, actorB.user_id, checklistTemplate);
    const canSubmitChecklistA = await canSubmitTemplateAsUser(
      client,
      actorA.user_id,
      organizationId,
      checklistTemplate.id,
    );
    const canSubmitChecklistB = await canSubmitTemplateAsUser(
      client,
      actorB.user_id,
      organizationId,
      checklistTemplate.id,
    );

    if (!canReadChecklistA || !canSubmitChecklistA) {
      throw new Error("Fallo validacion checklist: actor A deberia poder leer/enviar su plantilla privada.");
    }

    if (canReadChecklistB || canSubmitChecklistB) {
      throw new Error("Fallo validacion checklist: actor B NO deberia leer/enviar plantilla privada de actor A.");
    }

    const { rows: insertedAnnouncements } = await client.query(
      `insert into public.announcements (
         organization_id,
         branch_id,
         created_by,
         title,
         body,
         kind,
         is_featured,
         publish_at,
         target_scope
       )
       values ($1,$2,$3,$4,$5,'general',false,timezone('utc', now()),$6::jsonb)
       returning id, organization_id, branch_id, target_scope`,
      [
        organizationId,
        actorA.branch_id,
        actorA.user_id,
        "RLS TEST - Anuncio privado por usuario",
        "Solo usuario actor A debe verlo",
        JSON.stringify({
          users: [actorA.user_id],
          locations: [],
          department_ids: [],
        }),
      ],
    );

    const announcement = insertedAnnouncements[0];

    await client.query(
      `insert into public.announcement_audiences (organization_id, announcement_id, user_id)
       values ($1,$2,$3)`,
      [organizationId, announcement.id, actorA.user_id],
    );

    const canReadAnnouncementA = await canReadAnnouncementAsUser(client, actorA.user_id, announcement);
    const canReadAnnouncementB = await canReadAnnouncementAsUser(client, actorB.user_id, announcement);

    if (!canReadAnnouncementA) {
      throw new Error("Fallo validacion anuncios: actor A deberia poder leer su anuncio privado.");
    }

    if (canReadAnnouncementB) {
      throw new Error("Fallo validacion anuncios: actor B NO deberia leer anuncio privado de actor A.");
    }

    await client.query("rollback");
    console.log("OK: aislamiento documentos validado (empleado A puede leer, empleado B no puede leer).");
    console.log("OK: aislamiento checklists validado (empleado A puede leer/enviar, empleado B bloqueado).\n");
    console.log("OK: aislamiento anuncios validado (empleado A puede leer, empleado B bloqueado).\n");
    console.log(`- organization_id: ${organizationId}`);
    console.log(`- empleado A (permitido): ${actorA.user_id}`);
    console.log(`- empleado B (bloqueado): ${actorB.user_id}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await applyMigration(client);
    await verifyIsolation(client);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR apply-migration-and-verify-rls:", error.message);
  process.exit(1);
});
