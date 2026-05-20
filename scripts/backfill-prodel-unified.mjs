#!/usr/bin/env node
/**
 * Backfill de qbo_unified_invoices para la empresa "prodel" en PROD.
 *
 * Migra datos existentes de dos fuentes:
 *   1. integration_run_items  → facturas traídas por sync histórico
 *   2. qbo_webhook_events     → webhooks recibidos antes de la nueva tabla
 *
 * Uso:
 *   node --env-file=web/.env.production.local scripts/backfill-prodel-unified.mjs
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { createClient } = require(path.join(__dirname, "../web/node_modules/@supabase/supabase-js"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeStr(v) {
  return typeof v === "string" && v ? v : null;
}
function safeNum(v) {
  return typeof v === "number" && isFinite(v) ? v : null;
}

// ── 1. Encontrar org de prodel ────────────────────────────────────────────────

async function findProdelOrg() {
  const { data, error } = await admin
    .from("organizations")
    .select("id, name")
    .ilike("name", "%prodel%")
    .limit(5);
  if (error) throw new Error(`Error buscando org: ${error.message}`);
  if (!data || data.length === 0) throw new Error("No se encontró ninguna org con nombre 'prodel'");
  if (data.length > 1) {
    console.warn(`⚠️  Encontradas ${data.length} orgs con 'prodel' en el nombre:`);
    data.forEach((o) => console.warn(`   - ${o.id}  ${o.name}`));
    console.warn(`   Usando la primera: ${data[0].name}`);
  }
  return data[0];
}

// ── 2. Backfill desde integration_run_items (sync histórico) ──────────────────

async function backfillFromSync(organizationId) {
  console.log("\n📦 Backfill desde integration_run_items...");

  const { data: configs, error: cfgErr } = await admin
    .from("qbo_r365_sync_configs")
    .select("id")
    .eq("organization_id", organizationId);
  if (cfgErr) throw new Error(cfgErr.message);
  if (!configs || configs.length === 0) {
    console.log("   Sin sync configs, nada que migrar.");
    return 0;
  }

  let totalUpserted = 0;

  for (const cfg of configs) {
    const { data: runs, error: runErr } = await admin
      .from("integration_runs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("sync_config_id", cfg.id)
      .limit(1000);
    if (runErr) throw new Error(runErr.message);
    const runIds = (runs ?? []).map((r) => String(r.id));
    if (runIds.length === 0) continue;

    const { data: items, error: itemErr } = await admin
      .from("integration_run_items")
      .select("source_invoice_id, status, payload, created_at")
      .eq("organization_id", organizationId)
      .in("run_id", runIds)
      .not("source_invoice_id", "is", null)
      .neq("status", "skipped_duplicate")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (itemErr) throw new Error(itemErr.message);

    // Deduplicar: quedarse con el item más reciente por source_invoice_id
    const byInvoiceId = new Map();
    for (const row of items ?? []) {
      const key = String(row.source_invoice_id);
      if (!byInvoiceId.has(key)) byInvoiceId.set(key, row);
    }
    if (byInvoiceId.size === 0) continue;

    const toUpsert = [...byInvoiceId.values()].map((row) => {
      const p = (row.payload ?? {});
      const isSent = row.status === "uploaded" || row.status === "validated";
      const entityType = p.transactionTypeCode === "2" ? "CreditMemo" : "Invoice";
      return {
        organization_id: organizationId,
        sync_config_id: cfg.id,
        entity_id: String(row.source_invoice_id),
        entity_type: entityType,
        import_source: "sync",
        pipeline_status: isSent ? "enviada" : "mapeada",
        doc_number: safeStr(p.invoiceNumber),
        txn_date: safeStr(p.invoiceDate),
        due_date: safeStr(p.dueDate),
        total_amount: safeNum(p.totalAmount),
        currency: safeStr(p.currency),
        customer_name: safeStr(p.vendor),
        vendor_name: safeStr(p.vendor),
        mapped_at: String(row.created_at),
        sent_at: isSent ? String(row.created_at) : null,
      };
    });

    const batchSize = 100;
    for (let i = 0; i < toUpsert.length; i += batchSize) {
      const batch = toUpsert.slice(i, i + batchSize);
      const { error } = await admin.from("qbo_unified_invoices").upsert(batch, {
        onConflict: "organization_id,entity_id,entity_type",
        ignoreDuplicates: false,
      });
      if (error) throw new Error(`Upsert sync batch: ${error.message}`);
      totalUpserted += batch.length;
    }
    console.log(`   sync_config ${cfg.id}: ${toUpsert.length} facturas migradas`);
  }

  return totalUpserted;
}

// ── 3. Backfill desde qbo_webhook_events ─────────────────────────────────────

async function backfillFromWebhooks(organizationId) {
  console.log("\n🔔 Backfill desde qbo_webhook_events...");

  // Mapa qbo_customer_id → sync_config_id para este org
  const { data: configs, error: cfgErr } = await admin
    .from("qbo_r365_sync_configs")
    .select("id, qbo_customer_id")
    .eq("organization_id", organizationId)
    .not("qbo_customer_id", "is", null);
  if (cfgErr) throw new Error(`Error leyendo sync_configs: ${cfgErr.message}`);

  const customerToSyncConfig = new Map();
  for (const cfg of configs ?? []) {
    if (cfg.qbo_customer_id) customerToSyncConfig.set(String(cfg.qbo_customer_id), String(cfg.id));
  }

  if (customerToSyncConfig.size === 0) {
    console.log("   Sin sync configs con cliente QBO configurado, nada que migrar.");
    return 0;
  }
  console.log(`   ${customerToSyncConfig.size} sync config(s) con cliente QBO`);

  const { data: events, error } = await admin
    .from("qbo_webhook_events")
    .select("id, entity_id, entity, fetched_entity, created_at")
    .eq("organization_id", organizationId)
    .eq("signature_valid", true)
    .in("entity", ["Invoice", "CreditMemo"])
    .limit(2000);
  if (error) throw new Error(`Error leyendo webhook_events: ${error.message}`);
  if (!events || events.length === 0) {
    console.log("   Sin webhook events que migrar.");
    return 0;
  }

  // Deduplicar: preferir el que tenga fetched_entity
  const byKey = new Map();
  for (const ev of events) {
    const key = `${ev.entity_id}::${ev.entity}`;
    const prev = byKey.get(key);
    if (!prev || (ev.fetched_entity && !prev.fetched_entity)) byKey.set(key, ev);
  }
  const dedupedEvents = [...byKey.values()];
  console.log(`   ${events.length} eventos → ${dedupedEvents.length} únicos tras deduplicar`);

  const toUpsert = [];
  const orphanEntityIds = []; // sin sync config → borrar de unified si ya existen

  for (const ev of dedupedEvents) {
    const fe = ev.fetched_entity ?? null;
    const customerId = fe?.CustomerRef?.value ? String(fe.CustomerRef.value) : null;
    const syncConfigId = customerId ? (customerToSyncConfig.get(customerId) ?? null) : null;

    if (!syncConfigId) {
      orphanEntityIds.push({ entity_id: String(ev.entity_id), entity_type: ev.entity });
      continue;
    }

    toUpsert.push({
      organization_id: organizationId,
      webhook_event_id: ev.id,
      sync_config_id: syncConfigId,
      entity_id: String(ev.entity_id),
      entity_type: ev.entity,
      import_source: "webhook",
      pipeline_status: fe ? "capturada" : "en_cola",
      raw_entity: fe ?? null,
      fetched_at: fe ? String(ev.created_at) : null,
      doc_number: fe ? safeStr(fe.DocNumber) : null,
      txn_date: fe ? safeStr(fe.TxnDate) : null,
      due_date: fe ? safeStr(fe.DueDate) : null,
      total_amount: fe ? safeNum(fe.TotalAmt) : null,
      currency: fe ? safeStr(fe.CurrencyRef?.value) : null,
      customer_name: fe ? safeStr(fe.CustomerRef?.name) : null,
      vendor_name: fe ? safeStr(fe.CustomerRef?.name) : null,
    });
  }

  // Borrar huérfanos que ya pudieron haber sido insertados antes
  for (const orphan of orphanEntityIds) {
    await admin.from("qbo_unified_invoices")
      .delete()
      .eq("organization_id", organizationId)
      .eq("entity_id", orphan.entity_id)
      .eq("entity_type", orphan.entity_type);
  }
  if (orphanEntityIds.length > 0) {
    console.log(`   ${orphanEntityIds.length} webhooks sin sync config → eliminados de unified`);
  }

  if (toUpsert.length === 0) {
    console.log("   Sin webhooks con sync config asociada.");
    return 0;
  }

  const batchSize = 100;
  let upserted = 0;
  for (let i = 0; i < toUpsert.length; i += batchSize) {
    const batch = toUpsert.slice(i, i + batchSize);
    const { error: upsertErr } = await admin.from("qbo_unified_invoices").upsert(batch, {
      onConflict: "organization_id,entity_id,entity_type",
      ignoreDuplicates: false,
    });
    if (upsertErr) throw new Error(`Upsert webhook batch: ${upsertErr.message}`);
    upserted += batch.length;
  }
  console.log(`   ${upserted} webhook events migrados con sync config`);
  return upserted;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Backfill qbo_unified_invoices → PROD [prodel]\n");

  const org = await findProdelOrg();
  console.log(`✅ Org encontrada: ${org.name} (${org.id})`);

  const syncCount = await backfillFromSync(org.id);
  const webhookCount = await backfillFromWebhooks(org.id);

  console.log(`\n✅ Backfill completado.`);
  console.log(`   Sync items upsertados : ${syncCount}`);
  console.log(`   Webhook items upsertados: ${webhookCount}`);
  console.log(`   Total: ${syncCount + webhookCount}\n`);
}

main().catch((e) => {
  console.error(`\n❌ ${e.message}\n`);
  process.exit(1);
});
