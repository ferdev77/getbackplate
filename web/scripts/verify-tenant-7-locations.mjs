import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const TARGET_BRANCHES = 7;

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
      throw new Error("No hay organizaciones activas para verificar.");
    }

    const { rows: branches } = await client.query(
      `select id, name from public.branches where organization_id = $1 and is_active = true order by created_at asc`,
      [org.id],
    );

    if (branches.length < TARGET_BRANCHES) {
      throw new Error(`La org ${org.name} tiene ${branches.length} locaciones activas. Se requieren al menos ${TARGET_BRANCHES}.`);
    }

    const { rows: metricsRows } = await client.query(
      `
      with branch_list as (
        select id, name
        from public.branches
        where organization_id = $1 and is_active = true
      )
      select
        b.id,
        b.name,
        coalesce((select count(*) from public.employees e where e.organization_id = $1 and e.branch_id = b.id and e.status = 'active'), 0) as employees_active,
        coalesce((select count(*) from public.documents d where d.organization_id = $1 and d.branch_id = b.id), 0) as documents_count,
        coalesce((select count(*) from public.checklist_templates t where t.organization_id = $1 and t.branch_id = b.id and t.is_active = true), 0) as checklist_templates_active
      from branch_list b
      order by b.name asc
      `,
      [org.id],
    );

    console.table(metricsRows);
    console.log(`OK: validacion QA 7 locaciones completa para ${org.name} (${org.id}).`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("ERROR verify-tenant-7-locations:", error.message);
  process.exit(1);
});
