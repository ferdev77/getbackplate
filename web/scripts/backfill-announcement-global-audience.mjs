import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getEnvValue(content, key) {
  const prefix = `${key}=`;
  const line = content.split(/\r?\n/).find((row) => row.startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : "";
}

async function main() {
  const envText = await readFile(path.resolve(__dirname, "../.env.local"), "utf8");
  const connectionString = process.env.SUPABASE_DB_POOLER_URL || getEnvValue(envText, "SUPABASE_DB_POOLER_URL");
  if (!connectionString) throw new Error("SUPABASE_DB_POOLER_URL no encontrado");

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const result = await client.query(`
    insert into public.announcement_audiences (organization_id, announcement_id, branch_id, user_id)
    select a.organization_id, a.id, null, null
    from public.announcements a
    where not exists (
      select 1
      from public.announcement_audiences aa
      where aa.organization_id = a.organization_id
        and aa.announcement_id = a.id
        and aa.branch_id is null
        and aa.user_id is null
    )
  `);

  console.log(`OK: filas agregadas ${result.rowCount ?? 0}`);
  await client.end();
}

main().catch((error) => {
  console.error("ERROR backfill-announcement-global-audience:", error.message);
  process.exit(1);
});
