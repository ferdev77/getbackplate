import { NextResponse } from "next/server";
import { GET as purgeTrash } from "../../../webhooks/cron/purge-trash/route";
import { GET as processDocuments } from "../documents/process/route";
import { GET as processDeliveries } from "../deliveries/route";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

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

    // 4. Purge Stripe webhook dedup records older than 30 days
    const admin = createSupabaseAdminClient();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error: stripeCleanupError } = await admin
      .from("stripe_processed_events")
      .delete()
      .lt("processed_at", cutoff);

    results.push({
      task: "purgeStripeProcessedEvents",
      status: stripeCleanupError ? 500 : 200,
      error: stripeCleanupError?.message ?? null,
    });

    return NextResponse.json({ ok: true, results });
  } catch (error: unknown) {
    console.error("Master daily cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
