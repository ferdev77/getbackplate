import { NextResponse } from "next/server";
import { GET as purgeTrash } from "../../../webhooks/cron/purge-trash/route";
import { GET as processDocuments } from "../documents/process/route";
import { GET as processDeliveries } from "../deliveries/route";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  processEmployeeDocumentExpirationReminders,
  processEmployeeDocumentPendingReminders,
} from "@/modules/employees/services/document-expiration-reminders";

export const maxDuration = 60; // Attempt to allow up to 60s execution

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

    // 5. Process employee document expiration reminders
    const reminderResult = await processEmployeeDocumentExpirationReminders();
    results.push({
      task: "processEmployeeDocumentExpirationReminders",
      status: reminderResult.ok ? 200 : 500,
      ...reminderResult,
    });

    // 6. Process employee document pending SLA reminders
    const pendingReminderResult = await processEmployeeDocumentPendingReminders();
    results.push({
      task: "processEmployeeDocumentPendingReminders",
      status: pendingReminderResult.ok ? 200 : 500,
      ...pendingReminderResult,
    });

    // Shared 12-month retention cutoff for steps 7-9 below.
    const twelveMonthRetentionCutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // 7. Purge raw QuickBooks invoice payloads older than 12 months.
    // Keeps the summary columns (amount, customer, dates) for history/reporting,
    // only clears the full raw_entity payload we no longer need functionally.
    const { error: qboRawEntityCleanupError } = await admin
      .from("qbo_unified_invoices")
      .update({ raw_entity: null })
      .lt("created_at", twelveMonthRetentionCutoff)
      .not("raw_entity", "is", null);

    results.push({
      task: "purgeQboUnifiedInvoicesRawEntity",
      status: qboRawEntityCleanupError ? 500 : 200,
      error: qboRawEntityCleanupError?.message ?? null,
    });

    // 8. Purge general audit_logs older than 12 months. The RPC records a
    // durable summary in system_maintenance_logs in the same transaction.
    const { data: deletedAuditLogCount, error: auditLogsCleanupError } = await admin
      .rpc("purge_expired_audit_logs", { p_cutoff: twelveMonthRetentionCutoff });

    if (auditLogsCleanupError) {
      const { error: maintenanceLogError } = await admin
        .from("system_maintenance_logs")
        .insert({
          task: "audit_logs_retention",
          status: "failed",
          records_affected: 0,
          cutoff_at: twelveMonthRetentionCutoff,
          error_message: auditLogsCleanupError.message,
        });
      if (maintenanceLogError) {
        console.error("Unable to record failed audit log cleanup", maintenanceLogError);
      }
    }

    results.push({
      task: "purgeAuditLogs",
      status: auditLogsCleanupError ? 500 : 200,
      recordsDeleted: deletedAuditLogCount ?? 0,
      error: auditLogsCleanupError?.message ?? null,
    });

    // 9. Purge QBO/R365 integration_audit_logs older than 12 months.
    const { error: integrationAuditLogsCleanupError } = await admin
      .from("integration_audit_logs")
      .delete()
      .lt("created_at", twelveMonthRetentionCutoff);

    results.push({
      task: "purgeIntegrationAuditLogs",
      status: integrationAuditLogsCleanupError ? 500 : 200,
      error: integrationAuditLogsCleanupError?.message ?? null,
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
