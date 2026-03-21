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
      throw new Error("No hay organizaciones activas para setup QA.");
    }

    const { rows: branchRows } = await client.query(
      `select id, name from public.branches where organization_id = $1 and is_active = true order by created_at asc`,
      [org.id],
    );

    const missing = Math.max(0, TARGET_BRANCHES - branchRows.length);
    for (let index = 0; index < missing; index += 1) {
      const name = `QA Locacion ${branchRows.length + index + 1}`;
      await client.query(
        `insert into public.branches (organization_id, name, is_active)
         values ($1, $2, true)`,
        [org.id, name],
      );
    }

    const { rows: finalRows } = await client.query(
      `select id, name from public.branches where organization_id = $1 and is_active = true order by created_at asc`,
      [org.id],
    );

    console.table(finalRows.map((row) => ({ id: row.id, name: row.name })));
    console.log(`OK: org QA ${org.name} (${org.id}) con ${finalRows.length} locaciones activas.`);
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error("ERROR setup-tenant-qa-7-locations:", error.message);
  process.exit(1);
});
