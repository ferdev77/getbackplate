import { createRequire } from "module";
import path from "path";
const require = createRequire(import.meta.url);
const { Client } = require(path.join("c:/Users/pikachu/Downloads/saasresto", "web/node_modules/pg"));

const client = new Client({ connectionString: process.env.SUPABASE_DB_POOLER_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

const res = await client.query(`
  SELECT
    o.id,
    o.name,
    o.status       AS org_status,
    o.plan_id,
    o.integration_plan_id AS org_integration_plan_id,
    oa.id          AS addon_id,
    oa.status      AS addon_status,
    oa.integration_plan_id AS addon_integration_plan_id,
    oa.stripe_subscription_id
  FROM organizations o
  LEFT JOIN organization_addons oa ON oa.organization_id = o.id
  WHERE LOWER(o.name) LIKE '%puntos%cardinales%'
     OR LOWER(o.name) LIKE '%cardinales%'
`);

console.log("\n=== Puntos Cardinales — Organizations + Addons ===");
console.log(JSON.stringify(res.rows, null, 2));
await client.end();
