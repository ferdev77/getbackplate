import { NextResponse } from "next/server";
import { reconcileQboChangedTransactions } from "@/modules/integrations/qbo-r365/service";

export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reconciliation = await reconcileQboChangedTransactions(50, 240_000);
  return NextResponse.json({ reconciliation }, { status: 200 });
}
