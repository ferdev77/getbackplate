import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(
  __dirname,
  "../../supabase/migrations/20260622000001_push_broadcast_target_users.sql",
);
const version = "20260622000001";

async function main() {
  const sql = readFileSync(migrationPath, "utf8");
  const client = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  await client.connect();
  try {
    await client.query(sql);
    await client.query(
      `insert into supabase_migrations.schema_migrations(version) values ($1) on conflict do nothing`,
      [version],
    );

    const { rows } = await client.query(`
      select
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='push_send_logs' and column_name in ('target_type','user_ids','user_count')) as send_logs_cols,
        (select count(*)::int from information_schema.columns where table_schema='public' and table_name='push_scheduled_sends' and column_name in ('target_type','user_ids')) as scheduled_cols
    `);
    console.log("OK:", JSON.stringify(rows[0]));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR apply-push-broadcast-target-users-migration:", error.message);
  process.exit(1);
});
