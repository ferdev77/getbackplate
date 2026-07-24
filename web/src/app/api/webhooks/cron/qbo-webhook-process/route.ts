import { NextResponse } from "next/server";
import { processPendingQboDisconnects } from "@/modules/integrations/qbo-r365/service";
import { drainPendingQboWebhookReceipts } from "@/modules/integrations/qbo-r365/qbo-webhook-receipts";

export const maxDuration = 60;

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}

async function handle(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [receipts, disconnects] = await Promise.all([
    drainPendingQboWebhookReceipts(),
    processPendingQboDisconnects(),
  ]);
  return NextResponse.json({ receipts, disconnects }, { status: 200 });
}
