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

const envPath = process.argv[2] ?? ".env.local";
const label = process.argv[3] ?? envPath;

const env = parseEnvFile(envPath);
const url = env.SUPABASE_DB_POOLER_URL;
if (!url) throw new Error(`Missing SUPABASE_DB_POOLER_URL in ${envPath}`);

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("alter table public.qbo_r365_sync_configs add column if not exists lookback_hours integer not null default 48 check (lookback_hours >= 0 and lookback_hours <= 8760);");
await client.query("insert into supabase_migrations.schema_migrations(version) values ('20260505000002') on conflict do nothing;");
await client.query("notify pgrst, 'reload schema'");
await client.end();

console.log(`${label}: lookback_hours migration applied (or already present) and schema cache reloaded.`);
