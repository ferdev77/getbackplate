import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const EXPECTED_PROJECT_REF = "uubdslmtfxwraszinpao";
const PRODUCTION_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const fileName = process.argv[2] ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Migration refused: expected Supabase dev project");
}
if (databaseUrl.includes(PRODUCTION_PROJECT_REF) || apiUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Migration refused: production project detected");
}
if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(fileName) || path.basename(fileName) !== fileName) {
  throw new Error("Pass one migration filename from supabase/migrations");
}

const version = fileName.split("_")[0];
const name = fileName.slice(version.length + 1, -4);
const migrationPath = path.resolve("..", "supabase", "migrations", fileName);
const sql = await readFile(migrationPath, "utf8");
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  const { rowCount } = await client.query(
    "select 1 from supabase_migrations.schema_migrations where version = $1",
    [version],
  );
  if (rowCount) {
    console.log(`Migration ${version} is already applied in dev.`);
    process.exitCode = 0;
  } else {
    await client.query("begin");
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)",
      [version, name],
    );
    await client.query("commit");
    console.log(`Applied migration ${version} to Supabase dev.`);
  }
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
