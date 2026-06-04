#!/usr/bin/env node
/**
 * Aplica la migración 20260604000001_announcement_deliveries_processing_status.
 *
 * Agrega 'processing' como estado válido de announcement_deliveries para
 * permitir un claim atómico y evitar doble envío en ejecuciones concurrentes.
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-announcement-deliveries-processing-status.mjs dev
 *   node --env-file=web/.env.production.local scripts/apply-announcement-deliveries-processing-status.mjs prod
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { Client } = require(path.join(__dirname, "../web/node_modules/pg"));

const args = process.argv.slice(2);
const env = args.find((a) => !a.startsWith("--")) || "dev";
const dbUrlArg = args.find((a) => a.startsWith("--db-url="))?.split("=").slice(1).join("=");

function buildConnectionConfig() {
  if (dbUrlArg) {
    return { connectionString: dbUrlArg, ssl: { rejectUnauthorized: false } };
  }
  const poolerUrl = process.env.SUPABASE_DB_POOLER_URL;
  if (poolerUrl) {
    return { connectionString: poolerUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 };
  }
  console.error("❌ Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const MIGRATION_STATEMENTS = [
  {
    label: "1/2 — Drop constraint existente",
    sql: `ALTER TABLE public.announcement_deliveries
            DROP CONSTRAINT IF EXISTS announcement_deliveries_status_check`,
  },
  {
    label: "2/2 — Agregar constraint con 'processing'",
    sql: `ALTER TABLE public.announcement_deliveries
            ADD CONSTRAINT announcement_deliveries_status_check
            CHECK (status IN ('queued', 'processing', 'sent', 'failed'))`,
  },
];

async function main() {
  const config = buildConnectionConfig();
  const display = config.connectionString
    ? config.connectionString.replace(/:([^:@]+)@/, ":***@")
    : `${config.user}@${config.host}:${config.port}/${config.database}`;

  console.log(`\n🚀 Migrando base de datos [${env.toUpperCase()}]`);
  console.log(`   Conexión: ${display}\n`);

  const client = new Client(config);

  try {
    await client.connect();
    console.log("✅ Conexión establecida\n");
  } catch (e) {
    console.error(`❌ No se pudo conectar: ${e.message}`);
    process.exit(1);
  }

  let failed = 0;
  for (const { label, sql } of MIGRATION_STATEMENTS) {
    process.stdout.write(`   ${label}... `);
    try {
      await client.query(sql);
      console.log("✅");
    } catch (e) {
      console.log(`❌  ${e.message}`);
      failed++;
    }
  }

  await client.end();

  if (failed === 0) {
    console.log(`\n✅ Migración completada exitosamente en [${env.toUpperCase()}]\n`);
  } else {
    console.log(`\n⚠️  ${failed} statement(s) fallaron. Revisá los errores arriba.\n`);
    process.exit(1);
  }
}

main();
