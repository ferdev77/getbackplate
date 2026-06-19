import pg from "../web/node_modules/pg/lib/index.js";
const { Client } = pg;

const client = new Client({
  connectionString:
    "postgresql://postgres.mfhyemwypuzsqjqxtbjf:dy.7nci4Mfbfv+v@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
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
