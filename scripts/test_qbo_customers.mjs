import { createClient } from "@supabase/supabase-js";
import { createDecipheriv, createHash } from "crypto";

const SUPABASE_URL = "https://mfhyemwypuzsqjqxtbjf.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1maHllbXd5cHV6c3FqcXh0YmpmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzIxMDU5OSwiZXhwIjoyMDg4Nzg2NTk5fQ.KeJhP3-FTQJPcjdOrmFB43vGTrF44RXS7GKZ-Yb1VHA";
const ENCRYPTION_KEY = "a42e11b8de53636c3e7e278118dcf128e4bbb1e8cdcda0a6783cf0995f01a88b";
const ORG_ID = "55fa3893-666f-4562-a39e-fae5fe06d6f1";

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

  // Obtener conexión QBO de Prodel
  const { data: conn } = await admin
    .from("integration_connections")
    .select("config, secrets_ciphertext, secrets_iv, secrets_tag")
    .eq("organization_id", ORG_ID)
    .eq("provider", "quickbooks_online")
    .maybeSingle();

  if (!conn) { console.error("No se encontró conexión QBO para Prodel"); return; }

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

  // Refrescar token
  const QBO_CLIENT_ID = "ABRKOacLp4ZEE6XYXLdxlw65hK7nfRxCdACWJyjiLGJ1ZaoZbx";
  const QBO_CLIENT_SECRET = "9VuufBXV8C4j75aoQYEVjrz6NgLq3Ev40CJ7uoZN";
  console.log("Refrescando token QBO...");
  const tokenRes = await refreshToken(QBO_CLIENT_ID, QBO_CLIENT_SECRET, secrets.refreshToken);
  const accessToken = tokenRes.access_token;

  // Consultar customers
  console.log(`\nConsultando customers en QBO (realmId: ${realmId}, sandbox: ${useSandbox})...\n`);
  const query = "select Id, DisplayName, AcctNum from Customer where Active = true startposition 1 maxresults 100";
  const res = await fetch(`${baseUrl}/v3/company/${realmId}/query?minorversion=75`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json", "Content-Type": "application/text" },
    body: query,
  });

  const data = await res.json();
  const customers = data?.QueryResponse?.Customer ?? [];

  if (customers.length === 0) {
    console.log("Sin customers encontrados.");
    return;
  }

  console.log(`Customers encontrados: ${customers.length}\n`);
  console.log("ID          | AcctNum    | DisplayName");
  console.log("------------|------------|----------------------------");
  for (const c of customers) {
    const acctNum = c.AcctNum?.trim() || "(vacío)";
    console.log(`${String(c.Id).padEnd(12)}| ${acctNum.padEnd(11)}| ${c.DisplayName}`);
  }
}

main().catch(console.error);
