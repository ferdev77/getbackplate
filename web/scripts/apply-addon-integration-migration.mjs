/**
 * Applies addon integration fields migration:
 *   - Adds integration_plan_type to module_catalog
 *   - Sets qbo_r365 module's integration_plan_type = 'qbo_r365'
 *   - Adds integration_plan_id to organization_addons
 *
 * Run against dev:  node --env-file=.env.local scripts/apply-addon-integration-migration.mjs
 * Run against prod: node --env-file=.env.production.local scripts/apply-addon-integration-migration.mjs
 */

import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

const MIGRATION_SQL = `
ALTER TABLE public.module_catalog
  ADD COLUMN IF NOT EXISTS integration_plan_type text NULL;

UPDATE public.module_catalog
  SET integration_plan_type = 'qbo_r365'
  WHERE code = 'qbo_r365';

ALTER TABLE public.organization_addons
  ADD COLUMN IF NOT EXISTS integration_plan_id uuid NULL
    REFERENCES public.plans(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
`;

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    console.log("→ Aplicando migración addon_integration_fields...");
    await client.query(MIGRATION_SQL);
    console.log("  ✓ integration_plan_type agregado a module_catalog");
    console.log("  ✓ qbo_r365 module enlazado a plan type 'qbo_r365'");
    console.log("  ✓ integration_plan_id agregado a organization_addons");
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
