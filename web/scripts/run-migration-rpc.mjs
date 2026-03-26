import fs from "fs";
import { Client } from "pg";

async function executeMigration() {
  const sql = fs.readFileSync(
    "../supabase/migrations/20260326000000_employee_and_checklist_atomic_rpcs.sql",
    "utf-8"
  );
  
  const client = new Client({
    connectionString: process.env.SUPABASE_DB_POOLER_URL
  });

  await client.connect();
  console.log("Connected to DB, executing migration...");

  try {
    await client.query(sql);
    console.log("Migration executed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    await client.end();
  }
}

executeMigration();
