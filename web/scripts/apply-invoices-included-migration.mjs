/**
 * Applies plans invoices_included migration:
 *   - Adds invoices_included (integer, nullable) to plans table
 *
 * Run against dev:  node --env-file=.env.local scripts/apply-invoices-included-migration.mjs
 * Run against prod: node --env-file=.env.production.local scripts/apply-invoices-included-migration.mjs
 */

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const MIGRATION_SQL = `
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS invoices_included integer NULL;

NOTIFY pgrst, 'reload schema';
`;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log("→ Aplicando migración plans_invoices_included...");
    await client.query(MIGRATION_SQL);
    console.log("  ✓ invoices_included agregado a plans");
    console.log("  ✓ PostgREST schema cache notificado");
    console.log("\n✅ Migración aplicada correctamente.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
