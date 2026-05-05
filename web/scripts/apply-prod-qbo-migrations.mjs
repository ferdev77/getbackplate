import { readFileSync, rmSync } from "node:fs";
import pg from "pg";

function parseEnvFile(content) {
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

async function main() {
  const envText = readFileSync(".env.production.verify.tmp", "utf8");
  const env = parseEnvFile(envText);
  const url = env.SUPABASE_DB_POOLER_URL;

  if (!url) {
    throw new Error("Missing SUPABASE_DB_POOLER_URL in .env.production.verify.tmp");
  }

  const client = new pg.Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query("alter table public.qbo_r365_sync_configs add column if not exists lookback_hours integer not null default 48 check (lookback_hours >= 0 and lookback_hours <= 8760);");
  await client.query("insert into supabase_migrations.schema_migrations(version) values ('20260505000001') on conflict do nothing;");
  await client.query("insert into supabase_migrations.schema_migrations(version) values ('20260505000002') on conflict do nothing;");
  await client.end();

  rmSync(".env.production.verify.tmp", { force: true });
  console.log("Production migration alignment applied.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
