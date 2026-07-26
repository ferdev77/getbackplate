import { readdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const EXPECTED_PROJECT_REF = "uubdslmtfxwraszinpao";
const PRODUCTION_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Migration verification refused: expected Supabase dev project");
}
if (databaseUrl.includes(PRODUCTION_PROJECT_REF) || apiUrl.includes(PRODUCTION_PROJECT_REF)) {
  throw new Error("Migration verification refused: production project detected");
}

const files = await readdir(path.resolve("..", "supabase", "migrations"));
const localVersions = files
  .filter((name) => name.endsWith(".sql"))
  .map((name) => name.split("_")[0])
  .sort();
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  const { rows } = await client.query(
    "select version::text from supabase_migrations.schema_migrations order by version",
  );
  const remoteVersions = rows.map((row) => row.version);
  const localSet = new Set(localVersions);
  const remoteSet = new Set(remoteVersions);
  const missing = localVersions.filter((version) => !remoteSet.has(version));
  const extra = remoteVersions.filter((version) => !localSet.has(version));
  if (missing.length || extra.length) {
    throw new Error(`Migration drift. Missing in dev: ${missing.join(", ") || "none"}. Extra in dev: ${extra.join(", ") || "none"}.`);
  }
  console.log(`Supabase dev migrations synchronized: ${localVersions.length}/${remoteVersions.length}.`);
} finally {
  await client.end();
}
