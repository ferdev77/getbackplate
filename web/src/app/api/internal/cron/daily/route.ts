import { NextResponse } from "next/server";
import { GET as purgeTrash } from "../../../webhooks/cron/purge-trash/route";
import { GET as processDocuments } from "../documents/process/route";
import { GET as processDeliveries } from "../deliveries/route";

export const maxDuration = 60; // Attempt to allow up to 60s execution

export async function GET(request: Request) {
  try {
    const results = [];
    
    // 1. Purge trash
    const res1 = await purgeTrash(request);
    results.push({ task: "purgeTrash", status: res1?.status });

    // 2. Process documents
    const res2 = await processDocuments(request);
    results.push({ task: "processDocuments", status: res2?.status });

    // 3. Process deliveries
    const res3 = await processDeliveries(request);
    results.push({ task: "processDeliveries", status: res3?.status });

    return NextResponse.json({ ok: true, results });
  } catch (error: unknown) {
    console.error("Master daily cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
