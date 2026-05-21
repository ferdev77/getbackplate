/**
 * GET|POST /api/webhooks/cron/qbo-r365-sync
 *
 * Cron de recovery del pipeline unificado QBO → R365.
 * Se dispara una vez al día (vercel.json: "0 10 * * *").
 *
 * Propósito: procesar facturas que quedaron atascadas en el pipeline
 * porque el background call del webhook falló (timeout, FTP caído, token vencido).
 *
 * No hace fetch de nuevas facturas desde QBO — eso ocurre en tiempo real
 * cuando llega el webhook (fetchAndCaptureWebhookInvoice + mapAndSendUnifiedRow).
 *
 * Facturas que procesa:
 *   - en_cola   → re-fetch desde QBO, luego map + send
 *   - capturada → map + send
 *   - mapeada   → reintento de FTP send
 */
import { NextResponse } from "next/server";
import { processQboUnifiedQueue } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  return processCron(request);
}

export async function POST(request: Request) {
  return processCron(request);
}

async function processCron(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processQboUnifiedQueue();
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
