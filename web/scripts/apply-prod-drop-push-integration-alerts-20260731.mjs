// Aplica a produccion la eliminacion de push_subscriptions.notify_integration_alerts.
// Mismo patron que apply-prod-position-id-20260729.mjs: transaccion, lock de
// aviso, verificacion de idempotencia y control de que no cambie ninguna fila
// de datos (la migracion solo elimina una columna, no filas).
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const EXPECTED_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const DEVELOPMENT_PROJECT_REF = "uubdslmtfxwraszinpao";
const FILE_NAME = "20260731000002_drop_push_integration_alerts_opt_in.sql";

const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Production migration refused: expected production project");
}
if (databaseUrl.includes(DEVELOPMENT_PROJECT_REF) || apiUrl.includes(DEVELOPMENT_PROJECT_REF)) {
  throw new Error("Production migration refused: development project detected");
}

const version = FILE_NAME.split("_")[0];
const name = FILE_NAME.slice(FILE_NAME.indexOf("_") + 1, -4);
const sql = await readFile(path.resolve("..", "supabase", "migrations", FILE_NAME), "utf8");

const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

async function protectedState() {
  const { rows } = await client.query(`
    select
      (select count(*)::int from public.push_subscriptions) as total_subscriptions,
      (select count(*)::int from public.push_subscriptions where is_active) as active_subscriptions,
      (select count(*)::int from public.organizations) as organizations
  `);
  return rows[0];
}

await client.connect();
try {
  await client.query("begin isolation level repeatable read");
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  await client.query("select pg_advisory_xact_lock(20260731000002)");

  const { rowCount } = await client.query(
    "select 1 from supabase_migrations.schema_migrations where version = $1",
    [version],
  );
  if (rowCount) {
    await client.query("rollback");
    console.log(`Migration ${version} is already applied in production.`);
  } else {
    const before = await protectedState();
    await client.query(sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)",
      [version, name],
    );
    const after = await protectedState();
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`Protected row counts changed: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    }

    await client.query("commit");
    console.log(JSON.stringify({ applied: version, protectedState: after }, null, 2));
  }
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
