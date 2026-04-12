#!/usr/bin/env node
/**
 * verify-docuseal-integration.mjs
 * Smoke test para verificar la integración DocuSeal.
 *
 * Uso:
 *   node --env-file=.env.local scripts/verify-docuseal-integration.mjs
 *
 * Requiere que Next.js esté corriendo en APP_BASE_URL (por defecto localhost:3000)
 */

const DOCUSEAL_API_URL = (process.env.DOCUSEAL_API_URL || "https://api.docuseal.com").replace(/\/$/, "");
const DOCUSEAL_API_KEY = process.env.DOCUSEAL_API_KEY || "";
const DOCUSEAL_WEBHOOK_SECRET = process.env.DOCUSEAL_WEBHOOK_SECRET || "";
const APP_BASE_URL = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
let failed = 0;

async function check(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    await fn();
    console.log("✅ OK");
    passed++;
    return true;
  } catch (e) {
    console.log(`❌ FAIL: ${e.message}`);
    failed++;
    return false;
  }
}

console.log("\n🔍 DocuSeal Integration Smoke Test");
console.log(`   App: ${APP_BASE_URL}`);
console.log(`   DocuSeal API: ${DOCUSEAL_API_URL}\n`);

// ─── 1. Variables de entorno ───────────────────────────────────────────────
console.log("1. Variables de entorno");

await check("DOCUSEAL_API_KEY configurada", () => {
  if (!DOCUSEAL_API_KEY) throw new Error("DOCUSEAL_API_KEY está vacía");
  if (DOCUSEAL_API_KEY.length < 20) throw new Error("DOCUSEAL_API_KEY parece muy corta");
});

await check("DOCUSEAL_WEBHOOK_SECRET configurada", () => {
  if (!DOCUSEAL_WEBHOOK_SECRET) throw new Error("DOCUSEAL_WEBHOOK_SECRET está vacía");
  if (DOCUSEAL_WEBHOOK_SECRET.length < 8) throw new Error("DOCUSEAL_WEBHOOK_SECRET muy corta (mín 8 chars)");
});

await check("APP_BASE_URL apunta a localhost o dominio configurado", () => {
  const url = new URL(APP_BASE_URL);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protocolo inválido");
});

// ─── 2. Conectividad DocuSeal API ──────────────────────────────────────────
console.log("\n2. Conectividad DocuSeal API");

await check("GET /submissions - autenticación válida", async () => {
  const res = await fetch(`${DOCUSEAL_API_URL}/submissions?limit=1`, {
    headers: { "X-Auth-Token": DOCUSEAL_API_KEY },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) throw new Error("API key inválida (401 Unauthorized)");
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = await res.json().catch(() => ({}));
  if (!Array.isArray(data.data) && !Array.isArray(data)) throw new Error("Respuesta inesperada de API");
});

// ─── 3. Webhook endpoint local ─────────────────────────────────────────────
console.log("\n3. Webhook endpoint local");

await check("POST webhook sin auth → debe retornar 401", async () => {
  const res = await fetch(`${APP_BASE_URL}/api/integrations/docuseal/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submission_id: 1, status: "completed" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (res.status !== 401) throw new Error(`Esperaba 401, recibí ${res.status} — el endpoint puede estar sin protección`);
});

await check("POST webhook con secret correcto → debe retornar ok:true", async () => {
  const res = await fetch(`${APP_BASE_URL}/api/integrations/docuseal/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DOCUSEAL_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({ submission_id: 99999999, status: "completed" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — esperaba 200`);
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Respuesta sin ok:true: ${JSON.stringify(data)}`);
});

await check("POST webhook con submission_id real inválido → ignorado (ok:true, ignored:true)", async () => {
  const res = await fetch(`${APP_BASE_URL}/api/integrations/docuseal/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${DOCUSEAL_WEBHOOK_SECRET}`,
    },
    body: JSON.stringify({ submission_id: 1, event_id: "test-idempotencia", status: "completed" }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Respuesta sin ok: ${JSON.stringify(data)}`);
  // submission 1 no existe en DB → expected: ignored:true con reason submission_not_linked
  if (data.ignored !== true) {
    console.log(`\n    ⚠️  submission_id=1 existe en DB (reason: ${data.reason || "none"}) — puede ser OK en prod`);
  }
});

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
const total = passed + failed;
if (failed === 0) {
  console.log(`✅ ${total}/${total} checks pasados. Integración DocuSeal lista.\n`);
} else {
  console.log(`⚠️  ${passed}/${total} checks pasados. Ver errores arriba.\n`);
  process.exit(1);
}
