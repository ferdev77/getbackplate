import { Client } from "pg";
import fs from "fs";
import path from "path";

function getEnvVal(file, key) {
  const content = fs.readFileSync(file, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m && m[1] === key) return m[2].replace(/^"|"$/g, "");
  }
  return undefined;
}

const VERSION = "20260710000001";
const NAME = "rls_auto_enable_event_trigger";
const sqlPath = path.resolve("../supabase/migrations/20260710000001_rls_auto_enable_event_trigger.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

const devUrl = getEnvVal(".env.local", "SUPABASE_DB_POOLER_URL");
const client = new Client({ connectionString: devUrl, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(sql);
  await client.query(
    `insert into supabase_migrations.schema_migrations (version, name) values ($1, $2)
     on conflict (version) do nothing`,
    [VERSION, NAME]
  );
  await client.query("COMMIT");
  console.log("Migracion aplicada y registrada en DEV.");
} catch (err) {
  await client.query("ROLLBACK");
  console.error("Fallo, se hizo rollback:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
