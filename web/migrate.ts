const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.uubdslmtfxwraszinpao:wfr9Rhcq28L8Dg90@aws-1-us-east-1.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  console.log("Connected");
  await client.query(`
    ALTER TABLE public.organization_departments ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;
    ALTER TABLE public.department_positions ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;
    ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS sort_order integer not null default 0;
    
    -- Sync existing rows based on created_at arbitrarily if needed, 
    -- but for now default 0 is fine and they will re-order when dragged.
  `);
  console.log("Migration applied.");
  await client.end();
}

run().catch(console.error);
