#!/usr/bin/env node
/**
 * Aplica la migración de firma digital usando pg desde node_modules.
 * Uso:
 *   node scripts/apply-signature-migration.mjs dev   (usa DB_URL del arg o .env.local)
 *   node scripts/apply-signature-migration.mjs prod  (requiere --db-url=<url>)
 *
 * Ejemplos:
 *   node --env-file=web/.env.local scripts/apply-signature-migration.mjs dev
 *   node scripts/apply-signature-migration.mjs prod --db-url="postgresql://..."
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Usamos pg desde web/node_modules (ya está instalado)
const { Client } = require(path.join(__dirname, "../web/node_modules/pg"));

// --- Parsear argumentos ---
const args = process.argv.slice(2);
const env = args.find((a) => !a.startsWith("--")) || "dev";
const dbUrlArg = args.find((a) => a.startsWith("--db-url="))?.split("=").slice(1).join("=");

// --- Resolver config de conexión ---
// Retorna objeto { host, port, user, password, database, ssl } en lugar de URL
// para evitar problemas de encoding con caracteres especiales en el password.
function buildConnectionConfig() {
  if (dbUrlArg) {
    // Si viene --db-url, usarlo directamente como connection string
    return { connectionString: dbUrlArg, ssl: { rejectUnauthorized: false } };
  }

  // Intentar usar la URL completa del pooler si está disponible
  // (la URL en .env.local tiene el password ya correctamente encoded por el usuario)
  const poolerUrl = process.env.SUPABASE_DB_POOLER_URL;
  if (poolerUrl) {
    return { connectionString: poolerUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 };
  }

  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(
    /https:\/\/([^.]+)\.supabase\.co/
  )?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;

  if (!projectRef || !password) {
    console.error("❌ Faltan SUPABASE_DB_POOLER_URL o (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD) en el entorno.");
    process.exit(1);
  }

  // Fallback: construir la URL manualmente
  return {
    host: "aws-0-us-east-1.pooler.supabase.com",
    port: 5432,
    user: `postgres.${projectRef}`,
    password: password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  };
}

// --- Statements de la migración ---
const MIGRATION_STATEMENTS = [
  {
    label: "1/5 — Columna idempotencia (signature_last_webhook_event_id)",
    sql: `ALTER TABLE public.employee_documents
            ADD COLUMN IF NOT EXISTS signature_last_webhook_event_id TEXT`,
  },
  {
    label: "2/5 — Índice en signature_submission_id",
    sql: `CREATE INDEX IF NOT EXISTS employee_documents_sig_submission_id_idx
            ON public.employee_documents (signature_submission_id)
            WHERE signature_submission_id IS NOT NULL`,
  },
  {
    label: "3/5 — Unique index anti-race-condition (una firma activa por doc/empleado)",
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS employee_documents_one_active_sig_idx
            ON public.employee_documents (organization_id, employee_id, document_id)
            WHERE signature_status = 'requested'`,
  },
  {
    label: "4/5 — DROP constraint preexistente (si existe)",
    sql: `ALTER TABLE public.employee_documents
            DROP CONSTRAINT IF EXISTS employee_documents_signature_status_check`,
  },
  {
    label: "5/5 — CHECK constraint en signature_status",
    sql: `ALTER TABLE public.employee_documents
            ADD CONSTRAINT employee_documents_signature_status_check
            CHECK (
              signature_status IS NULL OR
              signature_status IN ('requested','viewed','completed','declined','expired','failed')
            )`,
  },
];

// --- Main ---
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
      // Ignorar errores de "ya existe" que no son capturados por IF NOT EXISTS
      if (e.code === "42P07" || e.code === "42710") {
        console.log("✅ (ya existía)");
      } else {
        console.log(`❌  ${e.message}`);
        failed++;
      }
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
