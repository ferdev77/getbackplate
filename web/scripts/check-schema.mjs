import pg from "pg";

const { Client } = pg;

async function run() {
  const db = new Client({
    connectionString: process.env.SUPABASE_DB_POOLER_URL,
    ssl: { rejectUnauthorized: false }, 
  });
  await db.connect();
  const res = await db.query("SELECT constraint_name, table_name, column_name FROM information_schema.key_column_usage WHERE table_name = 'user_preferences'");
  console.log(res.rows);
  await db.end();
}
run();
