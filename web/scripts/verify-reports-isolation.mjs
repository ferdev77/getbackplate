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

async function getOrCreateAuthUser(email) {
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`No se pudo listar usuarios auth: ${error.message}`);
    }

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) break;
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
    throw new Error("No hay organizaciones disponibles para prueba de reportes.");
  }

  const { rows: roleRows } = await client.query(
    `select id from public.roles where code = 'employee' limit 1`,
  );
  const employeeRoleId = roleRows[0]?.id;
  if (!employeeRoleId) {
    throw new Error("No existe rol 'employee'.");
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
}

async function loadActors(client) {
  const { rows } = await client.query(`
    select
      e.organization_id,
      e.id as employee_id,
      e.user_id,
      e.branch_id,
      au.email
    from public.employees e
    join auth.users au on au.id = e.user_id
    where e.user_id is not null
      and lower(au.email) in ('rls.testa@getbackplate.local', 'rls.testb@getbackplate.local')
    order by au.email asc
  `);

  const actorA = rows.find((row) => String(row.email).toLowerCase() === "rls.testa@getbackplate.local");
  const actorB = rows.find((row) => String(row.email).toLowerCase() === "rls.testb@getbackplate.local");

  if (!actorA || !actorB) return null;
  if (actorA.organization_id !== actorB.organization_id) {
    throw new Error("Los usuarios de prueba no comparten organizacion.");
  }

  return {
    organizationId: actorA.organization_id,
    actorA,
    actorB,
  };
}

async function canReadSubmission(client, userId, organizationId, submissionId) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
  const { rows } = await client.query(
    `select public.can_read_checklist_submission($1::uuid, $2::uuid) as allowed`,
    [organizationId, submissionId],
  );
  return Boolean(rows[0]?.allowed);
}

async function countVisibleSliceRows(client, userId, organizationId, submissionId, submissionItemId) {
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);

  const { rows } = await client.query(
    `
    with visible_submission as (
      select 1
      from public.checklist_submissions s
      where s.id = $2::uuid
        and s.organization_id = $1::uuid
        and public.can_read_checklist_submission(s.organization_id, s.id)
      limit 1
    ), visible_items as (
      select count(*)::int as total
      from public.checklist_submission_items si
      where si.submission_id = $2::uuid
        and si.organization_id = $1::uuid
        and public.can_read_checklist_submission(si.organization_id, si.submission_id)
    ), visible_comments as (
      select count(*)::int as total
      from public.checklist_item_comments c
      where c.submission_item_id = $3::uuid
        and c.organization_id = $1::uuid
        and (
          public.can_manage_org(c.organization_id)
          or exists (
            select 1
            from public.checklist_submission_items si
            join public.checklist_submissions s on s.id = si.submission_id
            where si.id = c.submission_item_id
              and si.organization_id = c.organization_id
              and s.organization_id = c.organization_id
              and s.submitted_by = auth.uid()
          )
        )
    ), visible_flags as (
      select count(*)::int as total
      from public.checklist_flags f
      where f.submission_item_id = $3::uuid
        and f.organization_id = $1::uuid
        and (
          public.can_manage_org(f.organization_id)
          or exists (
            select 1
            from public.checklist_submission_items si
            join public.checklist_submissions s on s.id = si.submission_id
            where si.id = f.submission_item_id
              and si.organization_id = f.organization_id
              and s.organization_id = f.organization_id
              and s.submitted_by = auth.uid()
          )
        )
    ), visible_attachments as (
      select count(*)::int as total
      from public.checklist_item_attachments a
      where a.submission_item_id = $3::uuid
        and a.organization_id = $1::uuid
        and (
          public.can_manage_org(a.organization_id)
          or exists (
            select 1
            from public.checklist_submission_items si
            join public.checklist_submissions s on s.id = si.submission_id
            where si.id = a.submission_item_id
              and si.organization_id = a.organization_id
              and s.organization_id = a.organization_id
              and s.submitted_by = auth.uid()
          )
        )
    )
    select
      (select count(*)::int from visible_submission) as submissions,
      (select total from visible_items) as items,
      (select total from visible_comments) as comments,
      (select total from visible_flags) as flags,
      (select total from visible_attachments) as attachments
    `,
    [organizationId, submissionId, submissionItemId],
  );

  return {
    submissions: Number(rows[0]?.submissions ?? 0),
    items: Number(rows[0]?.items ?? 0),
    comments: Number(rows[0]?.comments ?? 0),
    flags: Number(rows[0]?.flags ?? 0),
    attachments: Number(rows[0]?.attachments ?? 0),
  };
}

async function verifyReportsIsolation(client, context) {
  const { organizationId, actorA, actorB } = context;

  await client.query("begin");
  try {
    const { rows: branchRows } = await client.query(
      `select id from public.branches where organization_id = $1 order by created_at asc limit 1`,
      [organizationId],
    );
    const branchId = branchRows[0]?.id ?? null;

    const { rows: templates } = await client.query(
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
       returning id`,
      [
        organizationId,
        branchId,
        `RLS REPORT TEMPLATE ${Date.now()}`,
        JSON.stringify({ users: [actorA.user_id], locations: [], department_ids: [] }),
        actorA.user_id,
      ],
    );
    const templateId = templates[0]?.id;

    const { rows: sections } = await client.query(
      `insert into public.checklist_template_sections (organization_id, template_id, name, sort_order)
       values ($1,$2,'RLS Section',1)
       returning id`,
      [organizationId, templateId],
    );
    const sectionId = sections[0]?.id;

    const { rows: items } = await client.query(
      `insert into public.checklist_template_items (organization_id, section_id, label, priority, sort_order)
       values ($1,$2,'RLS Item','high',1)
       returning id`,
      [organizationId, sectionId],
    );
    const templateItemId = items[0]?.id;

    const { rows: submissions } = await client.query(
      `insert into public.checklist_submissions (
         organization_id,
         branch_id,
         template_id,
         submitted_by,
         status,
         submitted_at
       )
       values ($1,$2,$3,$4,'submitted',timezone('utc', now()))
       returning id`,
      [organizationId, branchId, templateId, actorA.user_id],
    );
    const submissionId = submissions[0]?.id;

    const { rows: submissionItems } = await client.query(
      `insert into public.checklist_submission_items (
         organization_id,
         submission_id,
         template_item_id,
         is_checked,
         is_flagged
       )
       values ($1,$2,$3,false,true)
       returning id`,
      [organizationId, submissionId, templateItemId],
    );
    const submissionItemId = submissionItems[0]?.id;

    await client.query(
      `insert into public.checklist_item_comments (organization_id, submission_item_id, author_id, comment)
       values ($1,$2,$3,'RLS report comment')`,
      [organizationId, submissionItemId, actorA.user_id],
    );

    await client.query(
      `insert into public.checklist_flags (organization_id, submission_item_id, reported_by, reason, status)
       values ($1,$2,$3,'RLS report flag','open')`,
      [organizationId, submissionItemId, actorA.user_id],
    );

    await client.query(
      `insert into public.checklist_item_attachments (
         organization_id,
         submission_item_id,
         uploaded_by,
         file_path,
         mime_type,
         file_size_bytes
       )
       values ($1,$2,$3,$4,'image/jpeg',2048)`,
      [organizationId, submissionItemId, actorA.user_id, `rls-report-tests/${Date.now()}.jpg`],
    );

    const canReadA = await canReadSubmission(client, actorA.user_id, organizationId, submissionId);
    const canReadB = await canReadSubmission(client, actorB.user_id, organizationId, submissionId);

    const actorARead = await countVisibleSliceRows(
      client,
      actorA.user_id,
      organizationId,
      submissionId,
      submissionItemId,
    );
    const actorBRead = await countVisibleSliceRows(
      client,
      actorB.user_id,
      organizationId,
      submissionId,
      submissionItemId,
    );

    const actorAOk =
      canReadA &&
      actorARead.submissions > 0 &&
      actorARead.items > 0 &&
      actorARead.comments > 0 &&
      actorARead.flags > 0 &&
      actorARead.attachments > 0;

    const actorBBlocked =
      !canReadB &&
      actorBRead.submissions === 0 &&
      actorBRead.items === 0 &&
      actorBRead.comments === 0 &&
      actorBRead.flags === 0 &&
      actorBRead.attachments === 0;

    if (!actorAOk) {
      throw new Error(`Actor A no puede ver su reporte fixture: ${JSON.stringify(actorARead)}`);
    }

    if (!actorBBlocked) {
      throw new Error(`Actor B pudo ver slices de reporte ajeno: ${JSON.stringify(actorBRead)}`);
    }

    await client.query("rollback");
    console.log("OK: aislamiento de reportes validado (submissions/items/comments/flags/attachments).");
    console.log(`- organization_id: ${organizationId}`);
    console.log(`- actor A permitido: ${actorA.user_id}`);
    console.log(`- actor B bloqueado: ${actorB.user_id}`);
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
    await ensureTestUsers(client);
    const context = await loadActors(client);
    if (!context) {
      throw new Error("No se pudo preparar contexto con rls.testa/rls.testb.");
    }
    await verifyReportsIsolation(client, context);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-reports-isolation:", error.message);
  process.exit(1);
});
