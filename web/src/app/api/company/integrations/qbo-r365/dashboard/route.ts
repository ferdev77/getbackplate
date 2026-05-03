import { NextResponse } from "next/server";
import { requireTenantModule } from "@/shared/lib/access";
import { getQboR365Snapshot, listQboR365InvoiceHistory, listQboR365Runs } from "@/modules/integrations/qbo-r365/service";

export const dynamic = "force-dynamic";

type StatCard = {
  label: string;
  value: string;
  subLabel: string;
  tone: "default" | "success" | "warning" | "muted";
};

export async function GET() {
  try {
    const tenant = await requireTenantModule("qbo_r365");
    const organizationId = tenant.organizationId;

    const [snapshot, runs, invoiceHistory] = await Promise.all([
      getQboR365Snapshot(organizationId),
      listQboR365Runs(organizationId, 50),
      listQboR365InvoiceHistory(organizationId, 120),
    ]);

    const totalRuns = runs.length;
    const totalInvoicesProcessed = runs.reduce((sum, r) => sum + Number(r.total_detected ?? 0), 0);
    const totalUploaded = runs.reduce((sum, r) => sum + Number(r.total_uploaded ?? 0), 0);
    const totalFailed = runs.reduce((sum, r) => sum + Number(r.total_failed ?? 0), 0);
    const lastRun = runs[0] ?? null;

    const statCards: StatCard[] = [
      {
        label: "Corridas Totales",
        value: String(totalRuns),
        subLabel: "Sincronizaciones ejecutadas",
        tone: "default",
      },
      {
        label: "Facturas Procesadas",
        value: String(totalInvoicesProcessed),
        subLabel: "Total detectadas en QBO",
        tone: totalInvoicesProcessed > 0 ? "success" : "muted",
      },
      {
        label: "Enviadas a R365",
        value: String(totalUploaded),
        subLabel: "Entregadas via FTP",
        tone: totalUploaded > 0 ? "success" : "muted",
      },
      {
        label: "Errores",
        value: String(totalFailed),
        subLabel: totalFailed > 0 ? "Requieren atencion" : "Sin errores",
        tone: totalFailed > 0 ? "warning" : "muted",
      },
    ];

    const formattedRuns = runs.map((run) => ({
      id: run.id,
      startedAt: run.started_at,
      completedAt: run.finished_at,
      status: run.status ?? "unknown",
      triggerSource: run.trigger_source ?? "manual",
      invoicesDetected: run.total_detected ?? 0,
      invoicesUploaded: run.total_uploaded ?? 0,
      invoicesSkipped: run.total_skipped_duplicates ?? 0,
      invoicesFailed: run.total_failed ?? 0,
      fileName: run.file_name ?? null,
      templateMode: (run.template_used as "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates" | null) ?? null,
      dryRun: (run.total_uploaded ?? 0) === 0 && (run.total_detected ?? 0) > 0 && run.status !== "failed",
      errorMessage: typeof (run.error_summary as Record<string, unknown> | null)?.message === "string"
        ? String((run.error_summary as Record<string, unknown>).message)
        : null,
    }));

    const now = new Date();
    const generatedAt = `Actualizado ${now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`;

    return NextResponse.json({
      generatedAt,
      connections: {
        qbo: {
          status: snapshot.qbo.status,
          realmId: snapshot.qbo.realmId,
          lastRefreshed: null,
        },
        ftp: {
          status: snapshot.r365Ftp.status,
          host: snapshot.r365Ftp.host,
        },
      },
      stats: {
        totalRuns,
        totalInvoicesProcessed,
        totalUploaded,
        totalFailed,
        lastRunAt: lastRun?.started_at ?? null,
        lastRunStatus: lastRun?.status ?? null,
      },
      statCards,
      runs: formattedRuns,
      invoiceHistory,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 },
    );
  }
}
