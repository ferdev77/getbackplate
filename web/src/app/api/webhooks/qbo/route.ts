import { NextResponse } from "next/server";
import { insertQboWebhookEvents } from "@/modules/integrations/qbo-r365/service";
import { verifyQboWebhookSignature } from "@/modules/integrations/qbo-r365/webhook-auth";

type IntuitWebhookPayload = {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: {
      id?: string;
      entities?: Array<{
        name?: string;
        id?: string;
        operation?: string;
        lastUpdated?: string;
      }>;
    };
  }>;
};

export async function POST(request: Request) {
  const signature = request.headers.get("intuit-signature");
  const rawBody = await request.text();
  let signatureValid = false;
  try {
    signatureValid = verifyQboWebhookSignature(rawBody, signature);
  } catch (err) {
    console.warn("[QBO Webhook] No se pudo verificar la firma — QBO_WEBHOOK_VERIFIER_TOKEN no configurado:", err instanceof Error ? err.message : err);
  }

  let parsed: IntuitWebhookPayload = {};
  try {
    parsed = JSON.parse(rawBody) as IntuitWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload JSON invalido" }, { status: 400 });
  }

  const events = (parsed.eventNotifications ?? []).flatMap((notification) => {
    const realmId = String(notification.realmId ?? "").trim();
    const intuitEventId = typeof notification.dataChangeEvent?.id === "string" ? notification.dataChangeEvent.id : null;
    if (!realmId) return [];

    return (notification.dataChangeEvent?.entities ?? [])
      .map((entity) => ({
        signatureValid,
        intuitEventId,
        realmId,
        entity: String(entity.name ?? "").trim(),
        entityId: String(entity.id ?? "").trim(),
        operation: String(entity.operation ?? "").trim(),
        lastUpdatedAt: entity.lastUpdated ? String(entity.lastUpdated) : null,
        rawPayload: entity as Record<string, unknown>,
        rawNotification: notification as Record<string, unknown>,
        rawHeaders: {
          intuitSignature: signature,
          contentType: request.headers.get("content-type"),
          userAgent: request.headers.get("user-agent"),
        },
      }))
      .filter((row) => row.entity && row.entityId && row.operation);
  });

  const result = await insertQboWebhookEvents(events);
  return NextResponse.json({ ok: true, signatureValid, ...result }, { status: 200 });
}
