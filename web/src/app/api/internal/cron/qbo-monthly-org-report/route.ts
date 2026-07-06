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

  // Corre el día 20 de cada mes a las 16:00 UTC.
  // Período de servicio: del 21 del mes anterior al 20 del mes actual
  // (coincide con el ciclo de facturación de los clientes de integración).
  const today = new Date();
  const periodEndDate = new Date(today.getFullYear(), today.getMonth(), 20); // día 20 del mes actual
  const periodStartDate = new Date(today.getFullYear(), today.getMonth() - 1, 21); // día 21 del mes anterior
  const periodEnd = isoDate(periodEndDate);
  const periodStart = isoDate(periodStartDate);

  const admin = createSupabaseAdminClient();
  const orgs = await listQboIntegrationOrganizations();
  const results = [];

  for (const org of orgs) {
    // Dedup: no enviar si ya se mandó el reporte de este período
    const { data: existingRun } = await admin
      .from("qbo_weekly_invoice_report_runs")
      .select("id")
      .eq("organization_id", org.id)
      .eq("period_start", periodStart)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (existingRun) {
      results.push({ organizationId: org.id, organizationName: org.name, skipped: "already_sent" });
      continue;
    }

    // Si nunca hubo ningún reporte (ni semanal ni mensual), es el primer envío histórico
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
        periodStart: isFirstRun ? null : periodStart,
        periodEnd: isFirstRun ? null : periodEnd,
        isHistorical: isFirstRun,
        recordRun: true,
        sendTo: "org",
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

  return NextResponse.json({ ok: true, periodStart, periodEnd, results });
}
