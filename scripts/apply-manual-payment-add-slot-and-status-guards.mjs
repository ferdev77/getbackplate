#!/usr/bin/env node
/**
 * Aplica la migración 20260604000002_manual_payment_add_slot_and_status_guards.
 *
 * Agrega 'add_slot' al CHECK constraint de manual_payment_orders.action_type,
 * habilitando pagos manuales para comprar slots extra de conexiones R365.
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-manual-payment-add-slot-and-status-guards.mjs dev
 *   node --env-file=web/.env.production.local scripts/apply-manual-payment-add-slot-and-status-guards.mjs prod
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
    label: "1/2 — Drop constraint existente (mpo_action_type_ck)",
    sql: `ALTER TABLE public.manual_payment_orders
            DROP CONSTRAINT IF EXISTS mpo_action_type_ck`,
  },
  {
    label: "2/2 — Agregar constraint con 'add_slot'",
    sql: `ALTER TABLE public.manual_payment_orders
            ADD CONSTRAINT mpo_action_type_ck
            CHECK (action_type IN ('activate_module', 'add_invoices', 'add_slot', 'custom'))`,
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
