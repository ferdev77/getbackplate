#!/usr/bin/env node
/**
 * Aplica la migración 20260603000002_organization_addons_extra_r365_slots.
 *
 * Agrega extra_r365_connections a organization_addons y la RPC increment_r365_slots.
 *
 * Uso:
 *   node --env-file=web/.env.local scripts/apply-extra-r365-slots-migration.mjs dev
 *   node --env-file=web/.env.production.local scripts/apply-extra-r365-slots-migration.mjs prod
 */
import { createRequire } from "module";
import path from "path";
const require = createRequire(import.meta.url);
const { Client } = require(path.join("c:/Users/pikachu/Downloads/saasresto", "web/node_modules/pg"));

const env = process.argv.slice(2).find(a => !a.startsWith("--")) || "dev";

const client = new Client({
  connectionString: process.env.SUPABASE_DB_POOLER_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

const STATEMENTS = [
  {
    label: "1/3 — Columna extra_r365_connections en organization_addons",
    sql: `ALTER TABLE public.organization_addons
            ADD COLUMN IF NOT EXISTS extra_r365_connections INTEGER NOT NULL DEFAULT 0
              CONSTRAINT oa_extra_r365_non_negative CHECK (extra_r365_connections >= 0)`,
  },
  {
    label: "2/3 — Comentario en extra_r365_connections",
    sql: `COMMENT ON COLUMN public.organization_addons.extra_r365_connections IS
            'Extra R365 sync slots purchased via payment links. Added on top of plans.max_r365_connections.'`,
  },
  {
    label: "3/3 — RPC increment_r365_slots",
    sql: `CREATE OR REPLACE FUNCTION public.increment_r365_slots(p_organization_id UUID, p_amount INTEGER)
          RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
          BEGIN
            UPDATE public.organization_addons
            SET extra_r365_connections = extra_r365_connections + p_amount,
                updated_at = timezone('utc', now())
            WHERE id = (
              SELECT id FROM public.organization_addons
              WHERE organization_id = p_organization_id AND status = 'active'
              ORDER BY created_at LIMIT 1
            );
          END; $$`,
  },
];

console.log(`\n🚀 Migrando base de datos [${env.toUpperCase()}]\n`);
await client.connect();
console.log("✅ Conexión establecida\n");

let failed = 0;
for (const { label, sql } of STATEMENTS) {
  process.stdout.write(`   ${label}... `);
  try {
    await client.query(sql);
    console.log("✅");
  } catch (e) {
    if (["42701", "42710"].includes(e.code)) { console.log("✅ (ya existía)"); }
    else { console.log(`❌  ${e.message}`); failed++; }
  }
}

await client.end();
if (failed === 0) console.log(`\n✅ Migración completada en [${env.toUpperCase()}]\n`);
else { console.log(`\n⚠️  ${failed} statement(s) fallaron.\n`); process.exit(1); }
