import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

async function verify() {
  const db = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  try {
    const orgId = '643630b0-5e8a-47a3-8e4c-919e22f2d52d';
    console.log(`Verifying Org: ${orgId}`);

    const b = await db.query('SELECT name FROM public.branches WHERE organization_id = $1', [orgId]);
    console.log(`Branches: ${b.rowCount}`);

    const d = await db.query('SELECT name FROM public.organization_departments WHERE organization_id = $1', [orgId]);
    console.log(`Depts: ${d.rowCount}`);

    const p = await db.query('SELECT name FROM public.department_positions WHERE organization_id = $1', [orgId]);
    console.log(`Positions: ${p.rowCount}`);

    const e = await db.query('SELECT email FROM public.employees WHERE organization_id = $1', [orgId]);
    console.log(`Employees: ${e.rowCount}`);

    if (b.rowCount === 4 && d.rowCount === 4 && p.rowCount === 4 && e.rowCount === 4) {
      console.log("DB VERIFICATION PASSED!");
    } else {
      console.error("DB VERIFICATION FAILED!");
      process.exit(1);
    }

  } finally {
    await db.end();
  }
}

verify().catch(console.error);
