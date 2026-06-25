import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { getQboR365Snapshot, getUnifiedInvoiceStats, listQboR365Runs, listQboR365InvoiceHistory } from "@/modules/integrations/qbo-r365/service";

export const dynamic = "force-dynamic";

type StatCard = {
  label: string;
  value: string;
  subLabel: string;
  tone: "default" | "success" | "warning" | "muted";
  quota?: {
    used: number;
    limit: number | null;
    periodEnd: string | null;
    overageRate: number | null;
  };
};

export async function GET() {
  try {
    const access = await assertCompanyAdminModuleApi("settings");
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const organizationId = access.tenant.organizationId;
    const supabase = createSupabaseAdminClient();

    // Fetch plan quota info: invoices_included + billing period end
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("integration_plan_id")
      .eq("id", organizationId)
      .maybeSingle();

    const integrationPlanId = orgRow?.integration_plan_id as string | null ?? null;

    const [planRow, addonRow] = await Promise.all([
      integrationPlanId
        ? supabase.from("plans").select("invoices_included, billing_period").eq("id", integrationPlanId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("organization_addons")
        .select("current_period_end, invoice_balance, invoice_allowance_override")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);

    const planData = planRow.data as { invoices_included?: number | null; billing_period?: string | null } | null;
    const basePlanInvoices = planData?.invoices_included ?? null;
    const billingPeriod = planData?.billing_period ?? "monthly";
    const addonData = addonRow.data as { invoice_balance?: number | null; invoice_allowance_override?: number | null } | null;
    const extraInvoiceBalance = addonData?.invoice_balance ?? 0;
    // El override (cuando esta seteado) reemplaza por completo el calculo normal,
    // igual que en usage-billing.ts -- ej. orgs sin setup fee pagado, a las que
    // se les cobra el 100% de las facturas (override = 0, sin cuota gratis).
    const invoicesIncluded = addonData?.invoice_allowance_override != null
      ? addonData.invoice_allowance_override
      : (basePlanInvoices != null ? basePlanInvoices + extraInvoiceBalance : null);
    const currentPeriodEnd = (addonRow.data as { current_period_end?: string | null } | null)?.current_period_end ?? null;
    const periodStart = currentPeriodEnd
      ? (() => {
          const start = new Date(currentPeriodEnd);
          if (billingPeriod === "yearly") {
            start.setFullYear(start.getFullYear() - 1);
          } else {
            start.setMonth(start.getMonth() - 1);
          }
          return start.toISOString();
        })()
      : null;

    const [snapshot, runs, invoiceHistory, unifiedStats] = await Promise.all([
      getQboR365Snapshot(organizationId),
      listQboR365Runs(organizationId, 50),
      listQboR365InvoiceHistory(organizationId, 120),
      getUnifiedInvoiceStats(organizationId, periodStart),
    ]);

    const lastRun = runs[0] ?? null;
    const totalFailed = runs.reduce((sum, r) => sum + Number(r.total_failed ?? 0), 0);

    const statCards: StatCard[] = [
      {
        label: "Facturas Importadas",
        value: String(unifiedStats.total),
        subLabel: "Sync · webhook · manual",
        tone: unifiedStats.total > 0 ? "success" : "muted",
      },
      {
        label: invoicesIncluded ? "Facturas este mes" : "Facturas Enviadas",
        value: invoicesIncluded
          ? `${unifiedStats.enviadasThisPeriod} / ${invoicesIncluded}`
          : String(unifiedStats.enviadas),
        subLabel: invoicesIncluded
          ? (unifiedStats.enviadasThisPeriod > invoicesIncluded
              ? `${unifiedStats.enviadasThisPeriod - invoicesIncluded} en excedente · $0.99 c/u`
              : `${invoicesIncluded - unifiedStats.enviadasThisPeriod} disponibles este mes`)
          : "Entregadas a R365 vía FTP",
        tone: invoicesIncluded && unifiedStats.enviadasThisPeriod > invoicesIncluded
          ? "warning"
          : unifiedStats.enviadas > 0 ? "success" : "muted",
        ...(invoicesIncluded ? {
          quota: {
            used: unifiedStats.enviadasThisPeriod,
            limit: invoicesIncluded,
            periodEnd: currentPeriodEnd,
            overageRate: 0.99,
          },
        } : {}),
      },
      {
        label: "Errores",
        value: String(unifiedStats.atascadas),
        subLabel: unifiedStats.atascadas > 0 ? "En cola más de 24h sin procesar" : "Sin errores",
        tone: unifiedStats.atascadas > 0 ? "warning" : "muted",
      },
    ];

    const statCardsOperation = statCards;
    const statCardsDeveloper = statCards;

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
      syncConfigId: run.sync_config_id ?? null,
      fileName: run.file_name ?? null,
      templateMode: (run.template_used as "by_item" | null) ?? null,
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
        totalRuns: runs.length,
        totalFailed,
        lastRunAt: lastRun?.started_at ?? null,
        lastRunStatus: lastRun?.status ?? null,
      },
      statCards,
      statCardsByMode: {
        operation: statCardsOperation,
        developer: statCardsDeveloper,
      },
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
