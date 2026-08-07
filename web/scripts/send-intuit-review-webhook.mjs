import { createDecipheriv, createHash, createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const docNumber = process.argv[2]?.trim();
const organizationName = process.env.INTUIT_REVIEW_ORGANIZATION?.trim() || "intuit sandbox";
const entityType = process.env.INTUIT_REVIEW_ENTITY_TYPE?.trim() || "Invoice";
if (!docNumber) {
  throw new Error("Usage: node scripts/send-intuit-review-webhook.mjs <DocNumber>");
}
if (organizationName.toLowerCase().includes("prodel")) {
  throw new Error("Refusing to run the Intuit review helper against Prodel.");
}
if (!new Set(["Invoice", "CreditMemo"]).has(entityType)) {
  throw new Error("INTUIT_REVIEW_ENTITY_TYPE must be Invoice or CreditMemo.");
}

const envFile = process.env.ENV_FILE?.trim() || ".env.production.local";
for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (!match || process.env[match[1]]) continue;
  const raw = match[2].trim();
  process.env[match[1]] = raw.startsWith('"') ? JSON.parse(raw) : raw;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const verifierToken = process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
const appUrl = process.env.APP_BASE_URL;
const encryptionSecret = process.env.INTEGRATIONS_ENCRYPTION_KEY;
if (!supabaseUrl || !serviceKey || !verifierToken || !appUrl || !encryptionSecret) {
  throw new Error(`Missing required variables in ${envFile}.`);
}
if (!supabaseUrl.includes("mfhyemwypuzsqjqxtbjf")) {
  throw new Error("This helper is restricted to the expected production project.");
}

const adminHeaders = { apikey: serviceKey, authorization: `Bearer ${serviceKey}` };
async function select(table, query) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, { headers: adminHeaders });
  if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  return response.json();
}

function decryptSecrets(connection) {
  const key = createHash("sha256").update(encryptionSecret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(connection.secrets_iv, "base64"));
  decipher.setAuthTag(Buffer.from(connection.secrets_tag, "base64"));
  return JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(connection.secrets_ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8"));
}

const orgQueryName = encodeURIComponent(organizationName);
const organizations = await select("organizations", `select=id,name&name=ilike.${orgQueryName}`);
if (organizations.length !== 1) {
  throw new Error(`Expected exactly one organization named '${organizationName}', found ${organizations.length}.`);
}
const organization = organizations[0];
const [connection] = await select(
  "integration_connections",
  `select=secrets_ciphertext,secrets_iv,secrets_tag&organization_id=eq.${organization.id}&provider=eq.quickbooks_online&status=eq.connected&limit=1`,
);
if (!connection) throw new Error("The Intuit review organization has no connected QuickBooks account.");
const secrets = decryptSecrets(connection);
if (!secrets.accessToken || !secrets.realmId) throw new Error("The QuickBooks connection is incomplete.");

const table = entityType === "CreditMemo" ? "CreditMemo" : "Invoice";
const escapedDocNumber = docNumber.replaceAll("'", "\\'");
const query = `select * from ${table} where DocNumber = '${escapedDocNumber}'`;
const qboResponse = await fetch(
  `https://quickbooks.api.intuit.com/v3/company/${encodeURIComponent(secrets.realmId)}/query?minorversion=75&query=${encodeURIComponent(query)}`,
  { headers: { accept: "application/json", authorization: `Bearer ${secrets.accessToken}` } },
);
if (qboResponse.status === 401) throw new Error("QuickBooks access expired. Reconnect it and run the command again.");
if (!qboResponse.ok) throw new Error(`QuickBooks lookup failed: ${qboResponse.status} ${await qboResponse.text()}`);
const entity = (await qboResponse.json())?.QueryResponse?.[table]?.[0];
if (!entity?.Id) throw new Error(`${entityType} '${docNumber}' was not found in the connected QuickBooks company.`);

const startedAt = new Date().toISOString();
const eventId = randomUUID();
const body = JSON.stringify({
  eventNotifications: [{
    realmId: secrets.realmId,
    dataChangeEvent: {
      id: eventId,
      entities: [{ name: entityType, id: entity.Id, operation: "Emailed", lastUpdated: startedAt }],
    },
  }],
});
const signature = createHmac("sha256", verifierToken).update(body).digest("base64");
const webhookResponse = await fetch(`${appUrl}/api/webhooks/qbo`, {
  method: "POST",
  headers: { "content-type": "application/json", "intuit-signature": signature, "intuit-t-id": eventId },
  body,
});
const accepted = await webhookResponse.json();
if (!webhookResponse.ok) throw new Error(`Webhook rejected: ${webhookResponse.status} ${JSON.stringify(accepted)}`);

let receipt = null;
let webhookEvent = null;
let unified = null;
for (let attempt = 0; attempt < 40; attempt += 1) {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  [receipt] = await select("qbo_webhook_receipts", `select=status,last_error&id=eq.${accepted.receiptId}`);
  [webhookEvent] = await select("qbo_webhook_events", `select=status,last_error&intuit_event_id=eq.${eventId}&limit=1`);
  [unified] = await select(
    "qbo_unified_invoices",
    `select=doc_number,pipeline_status,sent_at,total_amount&organization_id=eq.${organization.id}&entity_id=eq.${entity.Id}&entity_type=eq.${entityType}&limit=1`,
  );
  if (receipt?.status === "processed" && webhookEvent?.status === "processed" && unified?.pipeline_status === "enviada") break;
}

console.log(JSON.stringify({
  document: unified?.doc_number ?? docNumber,
  entityId: entity.Id,
  receiptId: accepted.receiptId,
  receiptStatus: receipt?.status ?? null,
  eventStatus: webhookEvent?.status ?? null,
  pipelineStatus: unified?.pipeline_status ?? null,
  sentAt: unified?.sent_at ?? null,
}, null, 2));

if (receipt?.status !== "processed" || webhookEvent?.status !== "processed" || unified?.pipeline_status !== "enviada") {
  process.exitCode = 1;
}
