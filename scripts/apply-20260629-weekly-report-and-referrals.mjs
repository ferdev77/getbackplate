#!/usr/bin/env node
/**
 * Aplica las dos migraciones del flujo de reporte semanal + referidos de vendors:
 *
 *   20260629000004_qbo_weekly_invoice_report.sql
 *     → columna contact_email_override en qbo_r365_sync_config_customers
 *     → tabla qbo_weekly_invoice_report_runs (control de deduplicación)
 *
 *   20260629000005_qbo_vendor_referrals.sql
 *     → tabla qbo_vendor_referrals (registro de referidos de sucursales)
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-20260629-weekly-report-and-referrals.mjs prod
 *   node --env-file=web/.env.local scripts/apply-20260629-weekly-report-and-referrals.mjs dev
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { Client } = require(path.join(__dirname, "../web/node_modules/pg"));

const args = process.argv.slice(2);
const target = args[0];

if (target !== "prod" && target !== "dev") {
  console.error("❌ Especificá el entorno: prod o dev");
  console.error("   Uso: node --env-file=web/.env.local scripts/apply-20260629-weekly-report-and-referrals.mjs [prod|dev]");
  process.exit(1);
}

function getConnectionUrl() {
  if (target === "prod") {
    const url = process.env.SUPABASE_DB_POOLER_URL_PROD;
    if (!url) {
      console.error("❌ Falta SUPABASE_DB_POOLER_URL_PROD en web/.env.local");
      process.exit(1);
    }
    return url;
  } else {
    const url = process.env.SUPABASE_DB_POOLER_URL;
    if (!url) {
      console.error("❌ Falta SUPABASE_DB_POOLER_URL en web/.env.local");
      process.exit(1);
    }
    return url;
  }
}

function readMigration(filename) {
  const filepath = path.join(__dirname, "../supabase/migrations", filename);
  return fs.readFileSync(filepath, "utf8");
}

const MIGRATIONS = [
  {
    version: "20260629000004",
    label: "qbo_weekly_invoice_report — columna contact_email_override + tabla qbo_weekly_invoice_report_runs",
    filename: "20260629000004_qbo_weekly_invoice_report.sql",
  },
  {
    version: "20260629000005",
    label: "qbo_vendor_referrals — tabla de referidos de vendors por sucursal",
    filename: "20260629000005_qbo_vendor_referrals.sql",
  },
];

async function main() {
  const connStr = getConnectionUrl();
  const display = connStr.replace(/:([^:@]+)@/, ":***@");
  const envLabel = target.toUpperCase();

  console.log(`\n🚀 Aplicando migraciones en [${envLabel}]`);
  console.log(`   Conexión: ${display}\n`);

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();
    console.log("✅ Conexión establecida\n");
  } catch (e) {
    console.error(`❌ No se pudo conectar: ${e.message}`);
    process.exit(1);
  }

  let failed = 0;

  for (const migration of MIGRATIONS) {
    console.log(`── ${migration.version}: ${migration.label}`);

    // Verificar si ya fue aplicada
    const { rows } = await client.query(
      `SELECT version FROM supabase_migrations.schema_migrations WHERE version = $1`,
      [migration.version],
    );

    if (rows.length > 0) {
      console.log(`   ⏭️  Ya aplicada, saltando.\n`);
      continue;
    }

    const sql = readMigration(migration.filename);

    try {
      process.stdout.write("   Aplicando SQL... ");
      await client.query(sql);
      console.log("✅");
    } catch (e) {
      console.log(`❌\n   Error: ${e.message}`);
      failed++;
      continue;
    }

    try {
      process.stdout.write("   Registrando en schema_migrations... ");
      await client.query(
        `INSERT INTO supabase_migrations.schema_migrations (version) VALUES ($1)`,
        [migration.version],
      );
      console.log("✅");
    } catch (e) {
      console.log(`⚠️  No se pudo registrar: ${e.message}`);
    }

    console.log();
  }

  await client.end();

  if (failed === 0) {
    console.log(`✅ Migraciones aplicadas exitosamente en [${envLabel}]\n`);
  } else {
    console.log(`\n⚠️  ${failed} migración(es) fallaron. Revisá los errores arriba.\n`);
    process.exit(1);
  }
}

main();
