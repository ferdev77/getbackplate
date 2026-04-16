import pg from "pg";
import fs from "fs";

const { Client } = pg;

async function run() {
  const sqlPath = process.argv[2];
  if (!sqlPath) {
    console.error("Please provide a path to a SQL file");
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({
    connectionString: process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to database");
    await client.query(sql);
    console.log("SQL executed successfully!");
  } catch (err) {
    console.error("Error executing SQL:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
