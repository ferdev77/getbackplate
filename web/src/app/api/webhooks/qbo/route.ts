import { after, NextResponse } from "next/server";
import { verifyQboWebhookSignature } from "@/modules/integrations/qbo-r365/webhook-auth";
import {
  drainPendingQboWebhookReceipts,
  insertSignedQboWebhookReceipt,
} from "@/modules/integrations/qbo-r365/qbo-webhook-receipts";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QBO_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: Request) {
  const signature = request.headers.get("intuit-signature");
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_QBO_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > MAX_QBO_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  try {
    if (!verifyQboWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: "Invalid Intuit signature" }, { status: 401 });
    }
  } catch {
    console.error("[qbo-webhook] Verifier token is not configured");
    return NextResponse.json({ error: "Webhook verification unavailable" }, { status: 503 });
  }

  try {
    const safeHeaders = {
      intuitTid: request.headers.get("intuit-t-id"),
      intuitSignatureAlgorithm: request.headers.get("intuit-signature-algorithm"),
      intuitSignatureId: request.headers.get("intuit-signature-id"),
      intuitCreatedTime: request.headers.get("intuit-created-time"),
      intuitNotificationSchemaVersion: request.headers.get("intuit-notification-schema-version"),
      contentType: request.headers.get("content-type"),
      userAgent: request.headers.get("user-agent"),
    };
    const receiptId = await insertSignedQboWebhookReceipt(rawBody, safeHeaders);
    after(async () => {
      await drainPendingQboWebhookReceipts(10).catch(() => undefined);
    });
    return NextResponse.json({ ok: true, receiptId }, { status: 200 });
  } catch {
    console.error("[qbo-webhook] Unable to persist signed receipt");
    return NextResponse.json({ error: "Webhook persistence unavailable" }, { status: 503 });
  }
}
