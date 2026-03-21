import { NextResponse } from "next/server";
import { processAnnouncementDeliveries } from "@/modules/announcements/services/deliveries";

// export const maxDuration = 60; // Max execution time for hobby (10s) to pro (300s)

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      // If we don't have a CRON_SECRET configured, we probably shouldn't let anyone hit this
      return NextResponse.json({ error: "Missing CRON_SECRET in environment" }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const start = Date.now();
    const result = await processAnnouncementDeliveries();
    
    return NextResponse.json({
      durationMs: Date.now() - start,
      ...result,
    });
  } catch (error: unknown) {
    console.error("Cron Error processing deliveries:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
