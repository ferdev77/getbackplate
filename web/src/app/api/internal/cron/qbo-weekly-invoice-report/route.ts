import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  listQboIntegrationOrganizations,
  sendWeeklyInvoiceReport,
} from "@/modules/integrations/qbo-r365/services/weekly-invoice-report.service";

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

  // Este cron corre los lunes a las 16:00 UTC (10-11am hora de Texas segun
  // horario de verano). "Hoy" es lunes; el periodo a reportar es la semana
  // calendario que recien termino: lunes a domingo anterior.
  const today = new Date();
  const periodEnd = isoDate(today);
  const periodStartDate = new Date(today);
  periodStartDate.setDate(periodStartDate.getDate() - 7);
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

    try {
      const result = await sendWeeklyInvoiceReport({
        organizationId: org.id,
        periodStart,
        periodEnd,
        isHistorical: false,
        recordRun: true,
      });
      results.push({ organizationId: org.id, organizationName: org.name, ...result });
    } catch (error) {
      results.push({
        organizationId: org.id,
        organizationName: org.name,
        error: error instanceof Error ? error.message : "error desconocido",
      });
    }
  }

  return NextResponse.json({ ok: true, periodStart, periodEnd, results });
}
