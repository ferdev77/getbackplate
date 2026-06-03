import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Client } = require("c:/Users/pikachu/Downloads/saasresto/web/node_modules/pg");

const client = new Client({ connectionString: process.env.SUPABASE_DB_POOLER_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

// Orgs con addon activo pero sin integration_plan_id en el addon
const desync = await client.query(`
  SELECT
    o.id,
    o.name,
    o.integration_plan_id   AS org_integration_plan_id,
    oa.id                   AS addon_id,
    oa.status               AS addon_status,
    oa.integration_plan_id  AS addon_integration_plan_id,
    oa.stripe_subscription_id
  FROM organizations o
  JOIN organization_addons oa ON oa.organization_id = o.id
  WHERE oa.status = 'active'
    AND oa.integration_plan_id IS NULL
  ORDER BY o.name
`);

console.log("\n=== Orgs con addon activo pero addon.integration_plan_id = NULL ===");
console.log(`Total: ${desync.rows.length}`);
console.log(JSON.stringify(desync.rows, null, 2));

// Orgs con addon activo Y con integration_plan_id en el addon (referencia)
const synced = await client.query(`
  SELECT COUNT(*) AS total
  FROM organization_addons
  WHERE status = 'active' AND integration_plan_id IS NOT NULL
`);
console.log(`\n=== Orgs con addon activo + integration_plan_id seteado: ${synced.rows[0].total} ===`);

await client.end();
