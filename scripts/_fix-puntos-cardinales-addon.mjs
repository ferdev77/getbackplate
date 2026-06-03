import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("c:/Users/pikachu/Downloads/saasresto/web/node_modules/pg");

const client = new Client({ connectionString: process.env.SUPABASE_DB_POOLER_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const res = await client.query(`
  UPDATE organization_addons
  SET integration_plan_id = '8c9f06ab-c2e0-4615-8bdb-3d1cc49bfa36'
  WHERE id = '502abe45-54f5-49b8-a446-77e77d93ccef'
    AND integration_plan_id IS NULL
  RETURNING id, organization_id, integration_plan_id, status
`);

if (res.rowCount === 1) {
  console.log("\n✅ Fix aplicado correctamente:");
  console.log(JSON.stringify(res.rows[0], null, 2));
} else {
  console.log("\n⚠️  No se actualizó ninguna fila (¿ya estaba seteado?)");
}

await client.end();
