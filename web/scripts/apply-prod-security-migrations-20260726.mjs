import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const EXPECTED_PROJECT_REF = "mfhyemwypuzsqjqxtbjf";
const DEVELOPMENT_PROJECT_REF = "uubdslmtfxwraszinpao";
const MIGRATIONS = [
  "20260726000003_harden_hr_and_privileged_rpcs.sql",
  "20260726000004_document_scope_and_semantics.sql",
  "20260726000005_harden_context_and_transaction_rpcs.sql",
  "20260726000006_fix_branch_only_document_scope.sql",
  "20260726000007_restore_delegated_hr_scope.sql",
  "20260726000008_restore_delegated_contract_scope.sql",
  "20260726000009_restore_service_user_lookup.sql",
  "20260726000010_stripe_event_processing_lifecycle.sql",
  "20260726000011_keep_stripe_status_default_compatible.sql",
];
const databaseUrl = process.env.SUPABASE_DB_POOLER_URL ?? "";
const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (!databaseUrl.includes(EXPECTED_PROJECT_REF) || !apiUrl.includes(EXPECTED_PROJECT_REF)) {
  throw new Error("Production migration refused: expected production project");
}
if (databaseUrl.includes(DEVELOPMENT_PROJECT_REF) || apiUrl.includes(DEVELOPMENT_PROJECT_REF)) {
  throw new Error("Production migration refused: development project detected");
}

const migrationSql = await Promise.all(MIGRATIONS.map(async (fileName) => ({
  fileName,
  version: fileName.split("_")[0],
  name: fileName.slice(fileName.indexOf("_") + 1, -4),
  sql: await readFile(path.resolve("..", "supabase", "migrations", fileName), "utf8"),
})));
const client = new pg.Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });

async function protectedCounts() {
  const { rows } = await client.query(`
    select
      (select count(*)::int from public.organizations) as organizations,
      (select count(*)::int from public.employees) as employees,
      (select count(*)::int from public.employee_contracts) as contracts,
      (select count(*)::int from public.documents) as documents,
      (select count(*)::int from public.integration_connections) as integration_connections,
      (select count(*)::int from public.integration_connections where status = 'connected') as connected_integrations,
      (select count(*)::int from public.qbo_r365_sync_configs) as qbo_sync_configs,
      (select count(*)::int from public.qbo_unified_invoices) as qbo_invoices
  `);
  return rows[0];
}

await client.connect();
try {
  await client.query("begin isolation level repeatable read");
  await client.query("set local lock_timeout = '5s'");
  await client.query("set local statement_timeout = '60s'");
  await client.query("select pg_advisory_xact_lock(20260726000003)");

  const { rows: appliedRows } = await client.query(
    "select version::text from supabase_migrations.schema_migrations where version = any($1::text[]) order by version",
    [migrationSql.map((migration) => migration.version)],
  );
  const appliedVersions = new Set(appliedRows.map((row) => row.version));
  const pendingMigrations = migrationSql.filter((migration) => !appliedVersions.has(migration.version));
  const firstPendingIndex = migrationSql.findIndex((migration) => !appliedVersions.has(migration.version));
  const hasGap = firstPendingIndex >= 0 && migrationSql
    .slice(firstPendingIndex)
    .some((migration) => appliedVersions.has(migration.version));
  if (hasGap || pendingMigrations.length === 0) {
    throw new Error(`Expected a non-empty pending suffix; applied: ${[...appliedVersions].join(", ") || "none"}`);
  }

  const before = await protectedCounts();
  for (const migration of pendingMigrations) {
    await client.query(migration.sql);
    await client.query(
      "insert into supabase_migrations.schema_migrations(version, name) values ($1, $2)",
      [migration.version, migration.name],
    );
  }
  const after = await protectedCounts();
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(`Protected row counts changed: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
  }

  await client.query("commit");
  console.log(JSON.stringify({ applied: pendingMigrations.map((migration) => migration.version), protectedCounts: after }, null, 2));
} catch (error) {
  try {
    await client.query("rollback");
  } catch {}
  throw error;
} finally {
  await client.end();
}
