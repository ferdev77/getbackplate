import { Client } from "pg";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const connectionString = process.env.SUPABASE_DB_POOLER_URL;

async function run() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB");

    const migrationsDir = path.join(process.cwd(), "..", "supabase", "migrations");
    
    // The two critical migrations
    const files = [
      "202603110005_fix_rls_recursion_auth_helpers.sql",
      "202603130015_company_users_rpc.sql"
    ];

    for (const file of files) {
      console.log(`Applying ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
      console.log(`Success: ${file}`);
    }

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
