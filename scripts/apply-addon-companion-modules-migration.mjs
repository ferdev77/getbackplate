#!/usr/bin/env node
/**
 * Aplica la migración 20260520000001_addon_companion_modules.
 *
 * Agrega la columna addon_companion_module_codes a module_catalog y
 * define los módulos compañeros para el add-on qbo_r365.
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-addon-companion-modules-migration.mjs dev
 *   node --env-file=web/.env.production.local scripts/apply-addon-companion-modules-migration.mjs prod
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
    label: "1/2 — Columna addon_companion_module_codes en module_catalog",
    sql: `ALTER TABLE public.module_catalog
            ADD COLUMN IF NOT EXISTS addon_companion_module_codes TEXT[] NOT NULL DEFAULT '{}'`,
  },
  {
    label: "2/2 — Módulos compañeros para qbo_r365 (settings + custom_branding)",
    sql: `UPDATE public.module_catalog
            SET addon_companion_module_codes = ARRAY['settings', 'custom_branding']
            WHERE code = 'qbo_r365'`,
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
      if (e.code === "42701") {
        // column already exists — idempotent, not an error
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
