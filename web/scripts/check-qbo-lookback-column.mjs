import { readFileSync } from "node:fs";
import pg from "pg";

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

async function check(filePath, label) {
  const env = parseEnvFile(filePath);
  const url = env.SUPABASE_DB_POOLER_URL;
  if (!url) throw new Error(`Missing SUPABASE_DB_POOLER_URL in ${filePath}`);

  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const result = await client.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='qbo_r365_sync_configs' and column_name='lookback_hours'",
  );
  const found = result.rowCount > 0;
  await client.query("notify pgrst, 'reload schema'");
  await client.end();

  console.log(`${label}: lookback_hours ${found ? "EXISTS" : "MISSING"} (schema cache reload sent)`);
}

const envPath = process.argv[2] ?? ".env.local";
const label = process.argv[3] ?? envPath;
await check(envPath, label);
