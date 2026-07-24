import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import {
  listQboIntegrationOrganizations,
  sendWeeklyInvoiceReport,
} from "@/modules/integrations/qbo-r365/services/weekly-invoice-report.service";

export const maxDuration = 60;

const CHICAGO_TZ = "America/Chicago";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Offset (ms) entre la hora de pared en `timeZone` y UTC, para el instante dado.
// Se recalcula por fecha porque el horario de verano de EE.UU. lo cambia dos veces al año.
function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return asUtc - date.getTime();
}

// Instante UTC exacto de medianoche en Chicago para el año/mes/día dado
// (mes en base 1). Ajusta sola por horario de verano.
function chicagoMidnightIso(year: number, month: number, day: number): string {
  const guessUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offsetMs = getTimeZoneOffsetMs(new Date(guessUtc), CHICAGO_TZ);
  return new Date(guessUtc - offsetMs).toISOString();
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

  // Corre el día 21 de cada mes a las 13:00 UTC (~8am Texas en verano / 7am en
  // invierno) — antes de que Stripe cobre la renovación, que siempre pasa a
  // las 14:31 UTC (ese instante no se mueve con el horario de verano).
  // Período de servicio: del 21 del mes anterior al 20 del mes actual, medido
  // en hora de Chicago (no UTC) para que entren TODAS las facturas de esos
  // días sin importar la hora exacta en que se hayan enviado.
  const today = new Date();
  const periodEndDate = new Date(today.getFullYear(), today.getMonth(), 20); // día 20 del mes actual (solo para mostrar)
  const periodStartDate = new Date(today.getFullYear(), today.getMonth() - 1, 21); // día 21 del mes anterior (solo para mostrar)
  const periodEnd = isoDate(periodEndDate); // etiqueta legible: "hasta el 20"

  // Límites reales de la consulta (hora de Chicago):
  const periodStart = chicagoMidnightIso(periodStartDate.getFullYear(), periodStartDate.getMonth() + 1, 21);
  const periodEndExclusive = chicagoMidnightIso(periodEndDate.getFullYear(), periodEndDate.getMonth() + 1, 21);

  const admin = createSupabaseAdminClient();
  const orgs = await listQboIntegrationOrganizations();
  const results = [];

  for (const org of orgs) {
    // Backfilled monthly rows count as prior monthly delivery, preventing an
    // unexpected historical report after cadence preferences are introduced.
    const { data: anyPriorRun } = await admin
      .from("qbo_weekly_invoice_report_runs")
      .select("id")
      .eq("organization_id", org.id)
      .eq("report_kind", "monthly")
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();
    const isFirstRun = !anyPriorRun;

    try {
      const result = await sendWeeklyInvoiceReport({
        organizationId: org.id,
        periodStart,
        periodEnd,
        periodEndExclusive,
        isHistorical: isFirstRun,
        cadence: "monthly",
        recordRun: true,
        sendTo: "all",
      });
      results.push({
        organizationId: org.id,
        organizationName: org.name,
        isFirstRun,
        ...(result.skippedAlreadySent ? { skipped: "already_sent" } : result),
      });
    } catch (error) {
      results.push({
        organizationId: org.id,
        organizationName: org.name,
        error: error instanceof Error ? error.message : "Unknown error.",
      });
    }
  }

  const hasDeliveryFailures = results.some((result) =>
    "error" in result || ("deliveryFailures" in result && result.deliveryFailures > 0),
  );
  return NextResponse.json(
    { ok: !hasDeliveryFailures, periodStart, periodEnd, periodEndExclusive, results },
    { status: hasDeliveryFailures ? 500 : 200 },
  );
}
