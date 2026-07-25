import { createHash } from "crypto";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { insertQboWebhookEvents } from "@/modules/integrations/qbo-r365/service";
import { parseQboWebhookEnvelope } from "@/modules/integrations/qbo-r365/qbo-webhook-payload";
import { notifyIntegrationEvent } from "@/infrastructure/push/integration-alerts";

type ReceiptRow = {
  id: string;
  raw_body_base64: string;
  safe_headers: Record<string, unknown>;
  status: string;
  attempts: number;
  claimed_at: string | null;
};

export async function insertSignedQboWebhookReceipt(
  rawBody: Uint8Array,
  safeHeaders: Record<string, string | null>,
) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("qbo_webhook_receipts").insert({
    body_sha256: createHash("sha256").update(rawBody).digest("hex"),
    raw_body_base64: Buffer.from(rawBody).toString("base64"),
    safe_headers: safeHeaders,
    signature_valid: true,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message || "Unable to persist the Intuit webhook receipt.");
  return String(data.id);
}

async function processReceipt(receipt: ReceiptRow) {
  const admin = createSupabaseAdminClient();
  const attempts = Number(receipt.attempts ?? 0);
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(receipt.raw_body_base64, "base64").toString("utf8")) as unknown;
  } catch {
    await admin.from("qbo_webhook_receipts").update({
      status: "malformed",
      attempts,
      ignored_entry_count: 1,
      processed_at: new Date().toISOString(),
      claimed_at: null,
      last_error: "signed_payload_invalid_json",
    }).eq("id", receipt.id).eq("status", "processing");
    await notifyIntegrationEvent({
      kind: "receipt_processing_failed",
      receiptId: receipt.id,
      status: "malformed",
      errorMessage: "The Intuit webhook payload could not be parsed as JSON.",
    });
    return { id: receipt.id, status: "malformed" as const, events: 0 };
  }

  const envelope = parseQboWebhookEnvelope(parsed);
  if (envelope.events.length === 0) {
    await admin.from("qbo_webhook_receipts").update({
      status: "unsupported",
      attempts,
      ignored_entry_count: envelope.ignoredEntries,
      processed_at: new Date().toISOString(),
      claimed_at: null,
      last_error: envelope.reasons.join(",").slice(0, 500) || "unsupported_payload",
    }).eq("id", receipt.id).eq("status", "processing");
    return { id: receipt.id, status: "unsupported" as const, events: 0 };
  }

  try {
    const result = await insertQboWebhookEvents(envelope.events.map((event) => ({
      ...event,
      signatureValid: true,
      rawHeaders: receipt.safe_headers,
    })));
    const status = envelope.ignoredEntries > 0 ? "partially_processed" : "processed";
    await admin.from("qbo_webhook_receipts").update({
      status,
      attempts,
      normalized_event_count: envelope.events.length,
      ignored_entry_count: envelope.ignoredEntries,
      processed_at: new Date().toISOString(),
      claimed_at: null,
      last_error: envelope.reasons.join(",").slice(0, 500) || null,
    }).eq("id", receipt.id).eq("status", "processing");
    return { id: receipt.id, status, events: envelope.events.length, ...result };
  } catch (error) {
    const errorMessage = (error instanceof Error ? error.message : "receipt_processing_failed").slice(0, 500);
    await admin.from("qbo_webhook_receipts").update({
      status: "failed",
      attempts,
      claimed_at: null,
      last_error: errorMessage,
    }).eq("id", receipt.id).eq("status", "processing");
    // Solo avisar en el ultimo intento permitido (ver drainPendingQboWebhookReceipts:
    // attempts >= 8 ya no vuelve a ser tomado por el cron, asi que este es el
    // punto en el que el recibo queda abandonado para siempre si nadie mira.
    if (attempts >= 8) {
      await notifyIntegrationEvent({
        kind: "receipt_processing_failed",
        receiptId: receipt.id,
        status: "failed",
        errorMessage: `Gave up after ${attempts} attempts: ${errorMessage}`,
      });
    }
    return { id: receipt.id, status: "failed" as const, events: 0 };
  }
}

export async function drainPendingQboWebhookReceipts(limit = 25) {
  const admin = createSupabaseAdminClient();
  const staleAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error: staleClaimError } = await admin.from("qbo_webhook_receipts").update({ status: "failed", claimed_at: null })
    .eq("status", "processing")
    .lt("claimed_at", staleAt);
  if (staleClaimError) throw new Error(staleClaimError.message);

  const { data, error } = await admin.from("qbo_webhook_receipts")
    .select("id, raw_body_base64, safe_headers, status, attempts, claimed_at")
    .in("status", ["pending", "failed"])
    .lt("attempts", 8)
    .order("received_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw new Error(error.message);

  const results = [];
  for (const candidate of data ?? []) {
    const { data: claimed, error: claimError } = await admin.from("qbo_webhook_receipts").update({
      status: "processing",
      claimed_at: new Date().toISOString(),
      attempts: Number(candidate.attempts ?? 0) + 1,
    }).eq("id", candidate.id)
      .eq("status", candidate.status)
      .eq("attempts", candidate.attempts)
      .select("id, raw_body_base64, safe_headers, status, attempts, claimed_at")
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) continue;
    results.push(await processReceipt(claimed as ReceiptRow));
  }
  return { processed: results.length, results };
}
