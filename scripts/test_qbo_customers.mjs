import { createClient } from "@supabase/supabase-js";
import { createDecipheriv, createHash } from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const ENCRYPTION_KEY = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim() ?? "";
const ORG_ID = process.env.TARGET_ORG_ID?.trim() ?? "";
const QBO_CLIENT_ID = process.env.QBO_CLIENT_ID?.trim() ?? "";
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET?.trim() ?? "";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !ENCRYPTION_KEY || !ORG_ID || !QBO_CLIENT_ID || !QBO_CLIENT_SECRET) {
  throw new Error("Missing Supabase, integration encryption, target organization, or QBO environment variables.");
}

function getKey() {
  return createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function decryptJsonPayload(input) {
  if (!input.ciphertext || !input.iv || !input.tag) return null;
  const key = getKey();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(input.iv, "base64"));
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

async function refreshToken(clientId, clientSecret, refreshToken) {
  const form = new URLSearchParams();
  form.set("grant_type", "refresh_token");
  form.set("refresh_token", refreshToken);
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  return res.json();
}

async function main() {
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: conn } = await admin
    .from("integration_connections")
    .select("config, secrets_ciphertext, secrets_iv, secrets_tag")
    .eq("organization_id", ORG_ID)
    .eq("provider", "quickbooks_online")
    .maybeSingle();

  if (!conn) {
    console.error("No QuickBooks connection was found for the target organization.");
    return;
  }

  const secrets = decryptJsonPayload({
    ciphertext: conn.secrets_ciphertext,
    iv: conn.secrets_iv,
    tag: conn.secrets_tag,
  });

  const realmId = conn.config?.realmId;
  const useSandbox = conn.config?.useSandbox ?? false;
  const baseUrl = useSandbox
    ? "https://sandbox-quickbooks.api.intuit.com"
    : "https://quickbooks.api.intuit.com";

  console.log("Refreshing QBO token...");
  const tokenRes = await refreshToken(QBO_CLIENT_ID, QBO_CLIENT_SECRET, secrets.refreshToken);
  const accessToken = tokenRes.access_token;

  console.log(`\nQuerying QBO customers (realmId: ${realmId}, sandbox: ${useSandbox})...\n`);
  const query = "select Id, DisplayName, AcctNum from Customer where Active = true startposition 1 maxresults 100";
  const res = await fetch(`${baseUrl}/v3/company/${realmId}/query?minorversion=75`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/text" },
    body: query,
  });

  const data = await res.json();
  const customers = data?.QueryResponse?.Customer ?? [];

  if (customers.length === 0) {
    console.log("No customers found.");
    return;
  }

  console.log(`Customers found: ${customers.length}\n`);
  console.log("ID          | AcctNum    | DisplayName");
  console.log("------------|------------|----------------------------");
  for (const customer of customers) {
    const acctNum = customer.AcctNum?.trim() || "(empty)";
    console.log(`${String(customer.Id).padEnd(12)}| ${acctNum.padEnd(11)}| ${customer.DisplayName}`);
  }
}

main().catch(console.error);
