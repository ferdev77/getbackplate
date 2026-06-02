import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const sqlFile = process.argv[2];

if (!sqlFile) {
  console.error("Uso: node --env-file=.env.local scripts/apply-sql-file.mjs <archivo.sql>");
  process.exit(1);
}

if (!process.env.SUPABASE_DB_POOLER_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const absolutePath = path.resolve(sqlFile);
const sql = fs.readFileSync(absolutePath, "utf8");
const client = new Client({ connectionString: process.env.SUPABASE_DB_POOLER_URL });

try {
  await client.connect();
  await client.query(sql);
  const checks = await client.query(`
    select
      (select count(*)::int from public.module_catalog where code = 'maintenance') as module_count,
      (
        select count(*)::int
        from information_schema.tables
        where table_schema = 'public'
          and table_name in (
            'maintenance_requests',
            'maintenance_request_updates',
            'maintenance_request_attachments'
          )
      ) as table_count,
      (
        select count(*)::int
        from public.permissions
        where module_code = 'maintenance'
      ) as permission_count
  `);
  console.log(JSON.stringify(checks.rows[0]));
} finally {
  await client.end();
}
