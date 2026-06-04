#!/usr/bin/env node
/**
 * Catchup DEV con 3 migraciones aplicadas en PROD pero nunca en DEV:
 *
 *   20260602000004_setup_fee_annual_discount.sql
 *     → plans.setup_fee_annual_discount_pct
 *
 *   20260602000009_integration_plan_max_connections.sql
 *     → plans.max_r365_connections
 *
 *   20260602000010_integration_onboarding.sql
 *     → organizations.integration_vendor_profile
 *     → organizations.integration_onboarding_completed_at
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-dev-catchup-20260602.mjs dev
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
  // ── 20260602000004_setup_fee_annual_discount ────────────────────────────
  {
    label: "1/5 — plans.setup_fee_annual_discount_pct (ADD COLUMN)",
    sql: `ALTER TABLE public.plans
            ADD COLUMN IF NOT EXISTS setup_fee_annual_discount_pct SMALLINT NOT NULL DEFAULT 25
              CONSTRAINT setup_fee_annual_discount_pct_range CHECK (setup_fee_annual_discount_pct BETWEEN 0 AND 100)`,
  },
  {
    label: "2/5 — plans.setup_fee_annual_discount_pct (COMMENT)",
    sql: `COMMENT ON COLUMN public.plans.setup_fee_annual_discount_pct IS
            'Percentage discount applied to the setup fee when billing period is annual (0-100). Default 25.'`,
  },

  // ── 20260602000009_integration_plan_max_connections ─────────────────────
  {
    label: "3/5 — plans.max_r365_connections (ADD COLUMN)",
    sql: `ALTER TABLE public.plans
            ADD COLUMN IF NOT EXISTS max_r365_connections INTEGER
              CONSTRAINT plans_max_r365_connections_positive CHECK (max_r365_connections IS NULL OR max_r365_connections > 0)`,
  },
  {
    label: "4/5 — plans.max_r365_connections (COMMENT)",
    sql: `COMMENT ON COLUMN public.plans.max_r365_connections IS
            'Maximum number of R365 customer connections (qbo_r365_sync_configs rows) allowed for this integration plan. NULL = unlimited.'`,
  },

  // ── 20260602000010_integration_onboarding ───────────────────────────────
  {
    label: "5/5 — organizations.integration_vendor_profile + integration_onboarding_completed_at",
    sql: `ALTER TABLE public.organizations
            ADD COLUMN IF NOT EXISTS integration_vendor_profile          JSONB,
            ADD COLUMN IF NOT EXISTS integration_onboarding_completed_at TIMESTAMPTZ`,
  },
];

async function main() {
  const config = buildConnectionConfig();
  const display = config.connectionString
    ? config.connectionString.replace(/:([^:@]+)@/, ":***@")
    : `${config.user}@${config.host}:${config.port}/${config.database}`;

  console.log(`\n🚀 Catchup DEV — 3 migraciones [${env.toUpperCase()}]`);
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
    console.log(`\n✅ Catchup completado exitosamente en [${env.toUpperCase()}]\n`);
  } else {
    console.log(`\n⚠️  ${failed} statement(s) fallaron. Revisá los errores arriba.\n`);
    process.exit(1);
  }
}

main();
