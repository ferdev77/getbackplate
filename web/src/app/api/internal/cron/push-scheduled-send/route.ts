import { NextResponse } from "next/server";
import { processDueNotificationBroadcasts } from "@/infrastructure/notifications/process-due-broadcasts";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await processDueNotificationBroadcasts();
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[push-scheduled-send] cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
