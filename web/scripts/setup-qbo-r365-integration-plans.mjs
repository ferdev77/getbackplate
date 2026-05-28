/**
 * Applies the plans integration migration and seeds the 4 QBO↔R365 plan cards.
 *
 * Run against dev:  node --env-file=.env.local scripts/setup-qbo-r365-integration-plans.mjs
 * Run against prod: node --env-file=.env.production.local scripts/setup-qbo-r365-integration-plans.mjs
 *
 * Uses pg directly for everything (bypasses PostgREST schema cache).
 */

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

// ─── Migration SQL ────────────────────────────────────────────────────────────

const MIGRATION_SQL = `
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS plan_type        text        NOT NULL DEFAULT 'platform',
  ADD COLUMN IF NOT EXISTS is_featured      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_enterprise    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS setup_fee_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS features         jsonb,
  ADD COLUMN IF NOT EXISTS cta_text         text,
  ADD COLUMN IF NOT EXISTS cta_email        text,
  ADD COLUMN IF NOT EXISTS sort_order       integer     NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_plan_type_check'
      AND conrelid = 'public.plans'::regclass
  ) THEN
    ALTER TABLE public.plans
      ADD CONSTRAINT plans_plan_type_check
        CHECK (plan_type IN ('platform', 'qbo_r365'));
  END IF;
END $$;

-- Notify PostgREST to reload schema cache so new columns are visible via API
NOTIFY pgrst, 'reload schema';
`;

// ─── Plan seed data ───────────────────────────────────────────────────────────

const PLANS = [
  {
    code: "qbo_r365_connect",
    name: "Connect",
    description: "For vendors starting their first R365 integration.",
    is_active: true,
    price_amount: 349,
    currency_code: "USD",
    billing_period: "monthly",
    plan_type: "qbo_r365",
    is_featured: false,
    is_enterprise: false,
    setup_fee_amount: 1200,
    sort_order: 1,
    cta_text: "Start Connecting →",
    cta_email: "angelo@mkthelp.com",
    features: [
      { text: "1 R365 customer connection", highlight: true },
      { text: "Up to 75 invoices per month" },
      { text: "Invoices and credit memos, fully automated" },
      { text: "Lands in your customer's R365 inbox" },
      { text: "$0.99 per invoice over 75" },
      { text: "Email support" },
    ],
  },
  {
    code: "qbo_r365_grow",
    name: "Grow",
    description: "For vendors serving multiple R365 customers.",
    is_active: true,
    price_amount: 649,
    currency_code: "USD",
    billing_period: "monthly",
    plan_type: "qbo_r365",
    is_featured: true,
    is_enterprise: false,
    setup_fee_amount: 2500,
    sort_order: 2,
    cta_text: "Start Growing →",
    cta_email: "angelo@mkthelp.com",
    features: [
      { text: "Up to 3 R365 customer connections", highlight: true },
      { text: "Up to 250 invoices per month" },
      { text: "$0.79 per invoice over 250" },
      { text: "Everything in Connect +", everything: true },
      { text: "All your R365 customers in one view" },
      { text: "Priority email support" },
    ],
  },
  {
    code: "qbo_r365_scale",
    name: "Scale",
    description: "For distributors with broad R365 customer reach.",
    is_active: true,
    price_amount: 1199,
    currency_code: "USD",
    billing_period: "monthly",
    plan_type: "qbo_r365",
    is_featured: false,
    is_enterprise: false,
    setup_fee_amount: 5000,
    sort_order: 3,
    cta_text: "Start Scaling →",
    cta_email: "angelo@mkthelp.com",
    features: [
      { text: "Up to 10 R365 customer connections", highlight: true },
      { text: "Up to 1,000 invoices per month" },
      { text: "$0.49 per invoice over 1,000" },
      { text: "Everything in Grow +", everything: true },
      { text: "Unlimited invoices (annual only)", highlight: true, annual_only: true },
    ],
  },
  {
    code: "qbo_r365_enterprise",
    name: "Enterprise",
    description: "For large distributors with custom needs.",
    is_active: true,
    price_amount: 0,
    currency_code: "USD",
    billing_period: "monthly",
    plan_type: "qbo_r365",
    is_featured: false,
    is_enterprise: true,
    setup_fee_amount: null,
    sort_order: 4,
    cta_text: "Talk to Sales →",
    cta_email: "angelo@mkthelp.com",
    features: [
      { text: "Unlimited R365 connections", highlight: true },
      { text: "Unlimited invoices" },
      { text: "Everything in Scale +", everything: true },
      { text: "Custom SLA" },
      { text: "Dedicated success manager" },
      { text: "Priority feature requests" },
      { text: "API access" },
      { text: "Data Processing Agreement" },
    ],
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  try {
    // Step 1: Migration
    console.log("→ Aplicando migración (ALTER TABLE plans + NOTIFY pgrst)...");
    await client.query(MIGRATION_SQL);
    console.log("  ✓ Migración aplicada y schema cache notificado.");

    // Step 2: Upsert plans via raw SQL (bypasses PostgREST schema cache entirely)
    console.log("→ Cargando 4 planes de integración QBO↔R365...");

    for (const plan of PLANS) {
      await client.query(
        `
        INSERT INTO public.plans (
          code, name, description, is_active,
          price_amount, currency_code, billing_period,
          plan_type, is_featured, is_enterprise,
          setup_fee_amount, sort_order,
          cta_text, cta_email, features
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12,
          $13, $14, $15::jsonb
        )
        ON CONFLICT (code) DO UPDATE SET
          name             = EXCLUDED.name,
          description      = EXCLUDED.description,
          is_active        = EXCLUDED.is_active,
          price_amount     = EXCLUDED.price_amount,
          currency_code    = EXCLUDED.currency_code,
          billing_period   = EXCLUDED.billing_period,
          plan_type        = EXCLUDED.plan_type,
          is_featured      = EXCLUDED.is_featured,
          is_enterprise    = EXCLUDED.is_enterprise,
          setup_fee_amount = EXCLUDED.setup_fee_amount,
          sort_order       = EXCLUDED.sort_order,
          cta_text         = EXCLUDED.cta_text,
          cta_email        = EXCLUDED.cta_email,
          features         = EXCLUDED.features
        `,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.is_active,
          plan.price_amount,
          plan.currency_code,
          plan.billing_period,
          plan.plan_type,
          plan.is_featured,
          plan.is_enterprise,
          plan.setup_fee_amount,
          plan.sort_order,
          plan.cta_text,
          plan.cta_email,
          JSON.stringify(plan.features),
        ],
      );
      console.log(`  ✓ Plan "${plan.name}" (${plan.code}) listo.`);
    }

    console.log("\n✅ Todo listo.");
    console.log("   → Visitá /integrations/qbo-r365 para ver la landing.");
    console.log("   → Desde /superadmin/plans podés agregar los stripe_price_id a cada plan.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
