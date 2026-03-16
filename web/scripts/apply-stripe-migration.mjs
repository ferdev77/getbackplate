import pkg from 'pg';
const { Client } = pkg;

async function run() {
  if (!process.env.SUPABASE_DB_POOLER_URL) {
    throw new Error("Missing SUPABASE_DB_POOLER_URL in env");
  }

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_POOLER_URL,
  });

  try {
    console.log("Connecting to database...");
    await client.connect();
    
    console.log("Applying stripe_price_id migration...");
    await client.query(`ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS stripe_price_id text UNIQUE;`);
    
    console.log("Reloading Supabase schema cache...");
    await client.query(`NOTIFY pgrst, 'reload schema';`);
    
    console.log("Migration and schema reload executed successfully!");
  } catch (error) {
    console.error("Error executing migration:", error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
