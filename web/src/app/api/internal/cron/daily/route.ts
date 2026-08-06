import { NextResponse } from "next/server";
import { GET as purgeTrash } from "../../../webhooks/cron/purge-trash/route";
import { GET as processDocuments } from "../documents/process/route";
import { GET as processDeliveries } from "../deliveries/route";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  processEmployeeDocumentExpirationReminders,
  processEmployeeDocumentPendingReminders,
} from "@/modules/employees/services/document-expiration-reminders";
import { reconcileOrphanReferralLeads } from "@/modules/leads/leads.service";
import { purgeOrphanDocumentUploads } from "@/modules/documents/services/orphan-uploads.service";

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
      .eq("status", "processed")
      .lt("completed_at", cutoff);

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

    const operationalCutoff = new Date();
    operationalCutoff.setUTCMonth(operationalCutoff.getUTCMonth() - 12);
    const fiscalCutoff = new Date();
    fiscalCutoff.setUTCFullYear(fiscalCutoff.getUTCFullYear() - 7);

    // 7. Purge general audit_logs older than 12 months. The RPC records a
    // durable summary in system_maintenance_logs in the same transaction.
    const { data: deletedAuditLogCount, error: auditLogsCleanupError } = await admin
      .rpc("purge_expired_audit_logs", { p_cutoff: operationalCutoff.toISOString() });

    if (auditLogsCleanupError) {
      const { error: maintenanceLogError } = await admin
        .from("system_maintenance_logs")
        .insert({
          task: "audit_logs_retention",
          status: "failed",
          records_affected: 0,
          cutoff_at: operationalCutoff.toISOString(),
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

    // 8. Enforce Intuit operational (12-month) and fiscal (7-year) retention.
    const { data: intuitRetentionCounts, error: intuitRetentionError } = await admin
      .rpc("purge_expired_intuit_data", {
        p_operational_cutoff: operationalCutoff.toISOString(),
        p_fiscal_cutoff: fiscalCutoff.toISOString(),
      });

    if (intuitRetentionError) {
      const { error: maintenanceLogError } = await admin.from("system_maintenance_logs").insert({
        task: "intuit_data_retention",
        status: "failed",
        records_affected: 0,
        cutoff_at: operationalCutoff.toISOString(),
        error_message: intuitRetentionError.message,
      });
      if (maintenanceLogError) {
        console.error("Unable to record failed Intuit data cleanup", maintenanceLogError);
      }
    }

    results.push({
      task: "purgeExpiredIntuitData",
      status: intuitRetentionError ? 500 : 200,
      counts: intuitRetentionCounts ?? null,
      error: intuitRetentionError?.message ?? null,
    });

    // 9. Intuit response trace IDs are operational diagnostics (12 months).
    const { count: intuitResponseLogCount, error: intuitResponseLogError } = await admin
      .from("intuit_api_response_logs")
      .delete({ count: "exact" })
      .lt("created_at", operationalCutoff.toISOString());
    await admin.from("system_maintenance_logs").insert({
      task: "intuit_api_response_retention",
      status: intuitResponseLogError ? "failed" : "success",
      records_affected: intuitResponseLogError ? 0 : (intuitResponseLogCount ?? 0),
      cutoff_at: operationalCutoff.toISOString(),
      error_message: intuitResponseLogError?.message ?? null,
    });
    results.push({
      task: "purgeIntuitApiResponseLogs",
      status: intuitResponseLogError ? 500 : 200,
      recordsDeleted: intuitResponseLogCount ?? 0,
      error: intuitResponseLogError?.message ?? null,
    });

    const [
      { count: receiptCount, error: receiptError },
      { count: reconciliationCount, error: reconciliationError },
      { count: oauthAttemptCount, error: oauthAttemptError },
    ] = await Promise.all([
      admin.from("qbo_webhook_receipts").delete({ count: "exact" }).lt("received_at", operationalCutoff.toISOString()),
      admin.from("qbo_cdc_reconciliation_runs").delete({ count: "exact" }).lt("created_at", operationalCutoff.toISOString()),
      admin.from("qbo_oauth_attempts").delete({ count: "exact" }).lt("expires_at", operationalCutoff.toISOString()),
    ]);
    results.push({
      task: "purgeQboReliabilityLogs",
      status: receiptError || reconciliationError || oauthAttemptError ? 500 : 200,
      recordsDeleted: (receiptCount ?? 0) + (reconciliationCount ?? 0) + (oauthAttemptCount ?? 0),
      error: receiptError?.message ?? reconciliationError?.message ?? oauthAttemptError?.message ?? null,
    });

    // 10. Recreate any superadmin_leads row that failed to insert when a vendor
    // referral was first submitted (createLead upserts, so this is safe to re-run daily).
    const leadReconciliation = await reconcileOrphanReferralLeads();
    results.push({
      task: "reconcileOrphanReferralLeads",
      status: leadReconciliation.ok ? 200 : 500,
      ...leadReconciliation,
    });

    // 11. Remove files left in storage by abandoned direct uploads. Only touches
    // the two prefixes the upload flow writes to, and only after 24h without a
    // matching row — see modules/documents/services/orphan-uploads.service.ts.
    const orphanUploads = await purgeOrphanDocumentUploads();
    await admin.from("system_maintenance_logs").insert({
      task: "orphan_document_uploads",
      status: orphanUploads.ok ? "success" : "failed",
      records_affected: orphanUploads.deleted,
      cutoff_at: new Date().toISOString(),
      error_message: orphanUploads.ok ? null : orphanUploads.error,
    });
    results.push({
      task: "purgeOrphanDocumentUploads",
      status: orphanUploads.ok ? 200 : 500,
      scanned: orphanUploads.scanned,
      recordsDeleted: orphanUploads.deleted,
      error: orphanUploads.ok ? null : orphanUploads.error,
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
