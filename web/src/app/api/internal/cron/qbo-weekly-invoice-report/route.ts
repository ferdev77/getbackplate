import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  listQboIntegrationOrganizations,
  sendWeeklyInvoiceReport,
} from "@/modules/integrations/qbo-r365/services/weekly-invoice-report.service";
import { sendOwnerWeeklyOpsReport } from "@/modules/integrations/qbo-r365/services/owner-weekly-ops.service";

export const maxDuration = 60;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  if (!cronSecret) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 500 });
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Este cron corre los lunes a las 16:00 UTC. Reporta la semana calendario
  // que acaba de terminar: lunes a domingo. "Hoy" es lunes, así que:
  //   periodEnd   = ayer (domingo)
  //   periodStart = hace 7 días (lunes anterior)
  const today = new Date();
  const periodEndDate = new Date(today);
  periodEndDate.setDate(periodEndDate.getDate() - 1); // domingo
  const periodEnd = isoDate(periodEndDate);
  const periodStartDate = new Date(today);
  periodStartDate.setDate(periodStartDate.getDate() - 7); // lunes anterior
  const periodStart = isoDate(periodStartDate);

  const admin = createSupabaseAdminClient();
  const orgs = await listQboIntegrationOrganizations();
  const results = [];

  for (const org of orgs) {
    const { data: existingRun } = await admin
      .from("qbo_weekly_invoice_report_runs")
      .select("id")
      .eq("organization_id", org.id)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existingRun) {
      results.push({ organizationId: org.id, organizationName: org.name, skipped: "already_sent" });
      continue;
    }

    // First run ever for this org: send everything delivered to date instead
    // of just the last 7 days, with a one-time framing notice in the email.
    const { data: anyPriorRun } = await admin
      .from("qbo_weekly_invoice_report_runs")
      .select("id")
      .eq("organization_id", org.id)
      .limit(1)
      .maybeSingle();
    const isFirstRun = !anyPriorRun;

    try {
      const result = await sendWeeklyInvoiceReport({
        organizationId: org.id,
        periodStart,
        periodEnd,
        isHistorical: isFirstRun,
        recordRun: true,
        sendTo: "branches",
      });
      results.push({ organizationId: org.id, organizationName: org.name, isFirstRun, ...result });
    } catch (error) {
      results.push({
        organizationId: org.id,
        organizationName: org.name,
        error: error instanceof Error ? error.message : "error desconocido",
      });
    }
  }

  let ownerReport;
  try {
    ownerReport = await sendOwnerWeeklyOpsReport({ periodStart, periodEnd });
  } catch (error) {
    ownerReport = { sent: false, reason: error instanceof Error ? error.message : "error desconocido" };
  }

  return NextResponse.json({ ok: true, periodStart, periodEnd, results, ownerReport });
}
