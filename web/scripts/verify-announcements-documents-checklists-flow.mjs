#!/usr/bin/env node

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;
const TARGET_ORG_ID = process.env.TARGET_ORG_ID || null;
const CLEANUP = process.env.CLEANUP_TEST_DATA === "true";
const KEEP_DATA = process.env.KEEP_TEST_DATA !== "false";
const RUN_TAG = process.env.RUN_TAG || `flow-${Date.now()}`;
const MODE = process.env.FLOW_ENV_LABEL || "unknown";

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL o DATABASE_URL en el entorno.");
  process.exit(1);
}

async function resolveContext(client) {
  const orgQuery = TARGET_ORG_ID
    ? await client.query(
        "select id, name, slug, status from public.organizations where id = $1 limit 1",
        [TARGET_ORG_ID],
      )
    : await client.query(
        "select id, name, slug, status from public.organizations where status = 'active' order by created_at asc limit 1",
      );

  const org = orgQuery.rows[0] ?? null;
  if (!org) {
    throw new Error("No se encontro organizacion objetivo.");
  }

  const branches = await client.query(
    "select id, name, city, is_active from public.branches where organization_id = $1 order by created_at asc",
    [org.id],
  );

  const memberships = await client.query(
    `
      select m.user_id, m.status, m.branch_id, r.code as role_code
      from public.memberships m
      left join public.roles r on r.id = m.role_id
      where m.organization_id = $1
      order by m.created_at asc
      limit 50
    `,
    [org.id],
  );

  const actor = memberships.rows.find((row) => row.status === "active" && row.role_code === "company_admin")
    ?? memberships.rows.find((row) => row.status === "active")
    ?? null;

  if (!actor?.user_id) {
    throw new Error("No se encontro un usuario activo para actuar como creador de registros de prueba.");
  }

  return {
    org,
    branches: branches.rows,
    memberships: memberships.rows,
    actor,
    branchId: actor.branch_id || branches.rows.find((b) => b.is_active)?.id || null,
  };
}

async function readBaseline(client, orgId) {
  const { rows } = await client.query(
    `
      select
        (select count(*)::int from public.announcements where organization_id = $1) as announcements,
        (select count(*)::int from public.checklist_templates where organization_id = $1) as checklist_templates,
        (select count(*)::int from public.documents where organization_id = $1 and deleted_at is null) as documents,
        (select count(*)::int from public.document_processing_jobs where organization_id = $1) as document_processing_jobs
    `,
    [orgId],
  );

  return rows[0];
}

async function createFlowData(client, context) {
  const created = {
    announcementId: null,
    checklistTemplateId: null,
    checklistSectionId: null,
    checklistItemId: null,
    documentId: null,
    documentJobId: null,
  };

  const titleBase = `[FLOW_TEST:${RUN_TAG}]`;

  await client.query("begin");

  try {
    const announcement = await client.query(
      `
        insert into public.announcements (
          organization_id, branch_id, created_by, title, body, kind, is_featured, publish_at, target_scope
        )
        values ($1,$2,$3,$4,$5,'general',false,timezone('utc', now()),$6::jsonb)
        returning id
      `,
      [
        context.org.id,
        context.branchId,
        context.actor.user_id,
        `${titleBase} Announcement`,
        "Registro de prueba automatica para validar flujo de anuncios.",
        JSON.stringify({ locations: [], department_ids: [], users: [] }),
      ],
    );
    created.announcementId = announcement.rows[0]?.id ?? null;

    await client.query(
      `
        insert into public.announcement_audiences (organization_id, announcement_id, branch_id, user_id)
        values ($1,$2,null,null)
      `,
      [context.org.id, created.announcementId],
    );

    const template = await client.query(
      `
        insert into public.checklist_templates (
          organization_id, branch_id, name, checklist_type, is_active, shift, repeat_every, target_scope, created_by
        )
        values ($1,$2,$3,'custom',true,'1er Shift','daily',$4::jsonb,$5)
        returning id
      `,
      [
        context.org.id,
        context.branchId,
        `${titleBase} Checklist`,
        JSON.stringify({ locations: context.branchId ? [context.branchId] : [], department_ids: [], users: [] }),
        context.actor.user_id,
      ],
    );
    created.checklistTemplateId = template.rows[0]?.id ?? null;

    const section = await client.query(
      `
        insert into public.checklist_template_sections (organization_id, template_id, name, sort_order)
        values ($1,$2,$3,0)
        returning id
      `,
      [context.org.id, created.checklistTemplateId, `${titleBase} Section`],
    );
    created.checklistSectionId = section.rows[0]?.id ?? null;

    const item = await client.query(
      `
        insert into public.checklist_template_items (organization_id, section_id, label, priority, sort_order)
        values ($1,$2,$3,'medium',0)
        returning id
      `,
      [context.org.id, created.checklistSectionId, `${titleBase} Item`],
    );
    created.checklistItemId = item.rows[0]?.id ?? null;

    const document = await client.query(
      `
        insert into public.documents (
          organization_id, branch_id, owner_user_id, title, file_path, mime_type, file_size_bytes, created_at
        )
        values ($1,$2,$3,$4,$5,'text/plain',128,timezone('utc', now()))
        returning id
      `,
      [
        context.org.id,
        context.branchId,
        context.actor.user_id,
        `${titleBase} Document`,
        `${context.org.id}/flow-tests/${RUN_TAG}.txt`,
      ],
    );
    created.documentId = document.rows[0]?.id ?? null;

    const job = await client.query(
      `
        insert into public.document_processing_jobs (organization_id, document_id, status, attempts)
        values ($1,$2,'pending',0)
        returning id
      `,
      [context.org.id, created.documentId],
    );
    created.documentJobId = job.rows[0]?.id ?? null;

    await client.query("commit");
    return created;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

async function cleanupFlowData(client, context, created) {
  await client.query("begin");
  try {
    if (created.documentJobId) {
      await client.query(
        "delete from public.document_processing_jobs where organization_id = $1 and id = $2",
        [context.org.id, created.documentJobId],
      );
    }

    if (created.documentId) {
      await client.query(
        "delete from public.documents where organization_id = $1 and id = $2",
        [context.org.id, created.documentId],
      );
    }

    if (created.announcementId) {
      await client.query(
        "delete from public.announcement_audiences where organization_id = $1 and announcement_id = $2",
        [context.org.id, created.announcementId],
      );
      await client.query(
        "delete from public.announcements where organization_id = $1 and id = $2",
        [context.org.id, created.announcementId],
      );
    }

    if (created.checklistTemplateId) {
      await client.query(
        `
          delete from public.checklist_template_items
          where organization_id = $1
            and section_id in (
              select id
              from public.checklist_template_sections
              where organization_id = $1 and template_id = $2
            )
        `,
        [context.org.id, created.checklistTemplateId],
      );
      await client.query(
        "delete from public.checklist_template_sections where organization_id = $1 and template_id = $2",
        [context.org.id, created.checklistTemplateId],
      );
      await client.query(
        "delete from public.checklist_templates where organization_id = $1 and id = $2",
        [context.org.id, created.checklistTemplateId],
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}

function assertIncremented(before, after) {
  const checks = [
    { name: "announcements", ok: Number(after.announcements) === Number(before.announcements) + 1 },
    { name: "checklist_templates", ok: Number(after.checklist_templates) === Number(before.checklist_templates) + 1 },
    { name: "documents", ok: Number(after.documents) === Number(before.documents) + 1 },
    { name: "document_processing_jobs", ok: Number(after.document_processing_jobs) === Number(before.document_processing_jobs) + 1 },
  ];

  const failed = checks.filter((item) => !item.ok);
  if (failed.length) {
    throw new Error(`Validacion de flujo fallida en: ${failed.map((item) => item.name).join(", ")}`);
  }
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const context = await resolveContext(client);
    const before = await readBaseline(client, context.org.id);

    const created = await createFlowData(client, context);
    const afterCreate = await readBaseline(client, context.org.id);
    assertIncremented(before, afterCreate);

    const shouldCleanup = CLEANUP || !KEEP_DATA;
    if (shouldCleanup) {
      await cleanupFlowData(client, context, created);
    }

    const finalState = await readBaseline(client, context.org.id);

    console.log("\n=== FLOW CHECK REPORT ===");
    console.log(`mode: ${MODE}`);
    console.log(`run_tag: ${RUN_TAG}`);
    console.log(`organization: ${context.org.name} (${context.org.id})`);
    console.log(`branches: ${context.branches.length}`);
    console.log(`memberships_sampled: ${context.memberships.length}`);
    console.log(`cleanup_executed: ${shouldCleanup}`);
    console.log("created:", created);
    console.table([
      {
        phase: "before",
        announcements: Number(before.announcements),
        checklist_templates: Number(before.checklist_templates),
        documents: Number(before.documents),
        document_processing_jobs: Number(before.document_processing_jobs),
      },
      {
        phase: "after_create",
        announcements: Number(afterCreate.announcements),
        checklist_templates: Number(afterCreate.checklist_templates),
        documents: Number(afterCreate.documents),
        document_processing_jobs: Number(afterCreate.document_processing_jobs),
      },
      {
        phase: "final",
        announcements: Number(finalState.announcements),
        checklist_templates: Number(finalState.checklist_templates),
        documents: Number(finalState.documents),
        document_processing_jobs: Number(finalState.document_processing_jobs),
      },
    ]);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-announcements-documents-checklists-flow:", error.message);
  process.exit(1);
});
