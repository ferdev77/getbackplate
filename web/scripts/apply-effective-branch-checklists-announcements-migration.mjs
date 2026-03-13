import { readFile } from "node:fs/promises";
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
  "../../supabase/migrations/202603130003_effective_branch_checklists_announcements.sql",
);

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const sql = await readFile(migrationPath, "utf8");
    await client.query("begin");
    await client.query(sql);
    await client.query("commit");
    console.log("OK: migracion 202603130003_effective_branch_checklists_announcements.sql aplicada.");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR apply-effective-branch-checklists-announcements-migration:", error.message);
  process.exit(1);
});
