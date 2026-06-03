#!/usr/bin/env node
/**
 * Aplica todas las migraciones de manual_payment_orders a la DB de dev.
 * Útil cuando dev no tiene la tabla todavía.
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-manual-payment-orders-to-dev.mjs
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { Client } = require(path.join(__dirname, "../web/node_modules/pg"));

function buildConnectionConfig() {
  const poolerUrl = process.env.SUPABASE_DB_POOLER_URL;
  if (poolerUrl) {
    return { connectionString: poolerUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15_000 };
  }
  console.error("❌ Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const MIGRATION_STATEMENTS = [
  // ── 20260602000007: tabla base ──────────────────────────────
  {
    label: "007-1 — Crear tabla manual_payment_orders",
    sql: `CREATE TABLE IF NOT EXISTS public.manual_payment_orders (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id   UUID        REFERENCES public.organizations(id) ON DELETE SET NULL,
      created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
      description       TEXT        NOT NULL,
      internal_notes    TEXT,
      amount_cents      INTEGER     NOT NULL CONSTRAINT mpo_amount_positive CHECK (amount_cents > 0),
      currency          TEXT        NOT NULL DEFAULT 'usd',
      action_type       TEXT        NOT NULL DEFAULT 'custom'
        CONSTRAINT mpo_action_type_ck CHECK (action_type IN ('activate_module', 'add_invoices', 'custom')),
      action_payload    JSONB,
      stripe_session_id TEXT        UNIQUE,
      checkout_url      TEXT,
      status            TEXT        NOT NULL DEFAULT 'pending'
        CONSTRAINT mpo_status_ck CHECK (status IN ('pending', 'paid', 'expired', 'canceled')),
      paid_at           TIMESTAMPTZ,
      expires_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
    )`,
  },
  {
    label: "007-2 — invoice_balance en organization_addons",
    sql: `ALTER TABLE public.organization_addons ADD COLUMN IF NOT EXISTS invoice_balance INTEGER NOT NULL DEFAULT 0`,
  },
  {
    label: "007-3 — Índices",
    sql: `CREATE INDEX IF NOT EXISTS idx_mpo_org ON public.manual_payment_orders (organization_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_mpo_status ON public.manual_payment_orders (status, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_mpo_session ON public.manual_payment_orders (stripe_session_id)`,
  },
  {
    label: "007-4 — RLS",
    sql: `ALTER TABLE public.manual_payment_orders ENABLE ROW LEVEL SECURITY;
          DROP POLICY IF EXISTS mpo_superadmin_all ON public.manual_payment_orders;
          CREATE POLICY mpo_superadmin_all ON public.manual_payment_orders
            FOR ALL TO authenticated
            USING (public.is_superadmin()) WITH CHECK (public.is_superadmin())`,
  },
  {
    label: "007-5 — Trigger updated_at",
    sql: `DROP TRIGGER IF EXISTS trg_mpo_updated_at ON public.manual_payment_orders;
          CREATE TRIGGER trg_mpo_updated_at
            BEFORE UPDATE ON public.manual_payment_orders
            FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()`,
  },
  {
    label: "007-6 — RPC increment_invoice_balance",
    sql: `CREATE OR REPLACE FUNCTION public.increment_invoice_balance(p_organization_id UUID, p_amount INTEGER)
          RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
          BEGIN
            UPDATE public.organization_addons
            SET invoice_balance = invoice_balance + p_amount, updated_at = timezone('utc', now())
            WHERE id = (
              SELECT id FROM public.organization_addons
              WHERE organization_id = p_organization_id AND status = 'active'
              ORDER BY created_at LIMIT 1
            );
          END; $$`,
  },
  // ── 20260602000008: traceability fields ────────────────────
  {
    label: "008-1 — Columnas stripe_payment_intent_id y customer_email",
    sql: `ALTER TABLE public.manual_payment_orders
            ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
            ADD COLUMN IF NOT EXISTS customer_email TEXT`,
  },
  // ── 20260603000001: items array ────────────────────────────
  {
    label: "001-1 — Columna items JSONB",
    sql: `ALTER TABLE public.manual_payment_orders ADD COLUMN IF NOT EXISTS items JSONB`,
  },
  {
    label: "001-2 — Comentario en columna items",
    sql: `COMMENT ON COLUMN public.manual_payment_orders.items IS
            'Array of line items for multi-item orders. Schema: [{description, amount_cents, action_type, action_payload}]. NULL for legacy single-item orders.'`,
  },
];

async function main() {
  const config = buildConnectionConfig();
  const display = config.connectionString.replace(/:([^:@]+)@/, ":***@");

  console.log(`\n🚀 Aplicando migraciones de manual_payment_orders [DEV]`);
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
      if (["42701", "42P07", "42710"].includes(e.code)) {
        console.log("✅ (ya existía)");
      } else {
        console.log(`❌  ${e.message}`);
        failed++;
      }
    }
  }

  await client.end();

  if (failed === 0) {
    console.log(`\n✅ Todas las migraciones aplicadas correctamente en [DEV]\n`);
  } else {
    console.log(`\n⚠️  ${failed} statement(s) fallaron. Revisá los errores arriba.\n`);
    process.exit(1);
  }
}

main();
