#!/usr/bin/env node
/**
 * Aplica la migración 20260520000002_qbo_unified_invoices.
 *
 * Crea la tabla qbo_unified_invoices como registro maestro unificado
 * de todas las facturas/créditos QBO, independientemente de si llegaron
 * por sync o por webhook.
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-unified-invoices-migration.mjs dev
 *   node --env-file=web/.env.production.local scripts/apply-unified-invoices-migration.mjs prod
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

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

const sqlPath = path.join(__dirname, "../supabase/migrations/20260520000002_qbo_unified_invoices.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

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

  try {
    process.stdout.write("   Aplicando migración 20260520000002_qbo_unified_invoices... ");
    await client.query(sql);
    console.log("✅");
  } catch (e) {
    if (e.code === "42P07") {
      console.log("✅ (tabla ya existía)");
    } else {
      console.log(`❌  ${e.message}`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log(`\n✅ Migración completada exitosamente en [${env.toUpperCase()}]\n`);
}

main();
