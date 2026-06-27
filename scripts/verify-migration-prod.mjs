// Uso: node --env-file=web/.env.local scripts/verify-migration-prod.mjs
import pg from "../web/node_modules/pg/lib/index.js";
const { Client } = pg;

if (!process.env.SUPABASE_DB_POOLER_URL_PROD) {
  console.error("❌ Falta SUPABASE_DB_POOLER_URL_PROD en el entorno.");
  console.error("   Corré con: node --env-file=web/.env.local scripts/verify-migration-prod.mjs");
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.SUPABASE_DB_POOLER_URL_PROD,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

const table = await client.query(
  `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'push_subscriptions' ORDER BY ordinal_position`
);
console.log("Columnas de push_subscriptions:");
table.rows.forEach((r) => console.log(`  ${r.column_name} (${r.data_type})`));

const policies = await client.query(
  `SELECT policyname, cmd FROM pg_policies WHERE tablename = 'push_subscriptions'`
);
console.log("\nRLS Policies:");
policies.rows.forEach((r) => console.log(`  ${r.policyname} (${r.cmd})`));

const indexes = await client.query(
  `SELECT indexname FROM pg_indexes WHERE tablename = 'push_subscriptions'`
);
console.log("\nÍndices:");
indexes.rows.forEach((r) => console.log(`  ${r.indexname}`));

await client.end();
