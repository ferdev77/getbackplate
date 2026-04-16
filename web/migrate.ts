import { Client } from "pg";

const connectionString = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing SUPABASE_DB_POOLER_URL or DATABASE_URL");
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  await client.connect();
  console.log("Connected");
  await client.query(`
    ALTER TABLE public.organization_departments ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;
    ALTER TABLE public.department_positions ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;
    ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;
  `);
  console.log("Migration applied.");
  await client.end();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
