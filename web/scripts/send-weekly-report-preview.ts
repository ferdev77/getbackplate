// Script para enviar reportes de facturas QBO→R365 manualmente.
//
// Uso:
//   node --env-file=.env.production.local node_modules/tsx/dist/cli.mjs scripts/send-weekly-report-preview.ts \
//     --org="Prodel" --override=tucorreo@ejemplo.com [--historical] [--send-to=all|org|branches]

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendWeeklyInvoiceReport } from "@/modules/integrations/qbo-r365/services/weekly-invoice-report.service";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function resolveOrg(orgArg: string): Promise<{ id: string; name: string }> {
  const admin = createSupabaseAdminClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(orgArg);
  const { data, error } = isUuid
    ? await admin.from("organizations").select("id, name").eq("id", orgArg).maybeSingle()
    : await admin.from("organizations").select("id, name").ilike("name", `%${orgArg}%`).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`Organizacion no encontrada: "${orgArg}"`);
  return { id: data.id, name: data.name };
}


async function main() {
  const orgArg = getArg("org");
  const override = getArg("override");
  const historical = process.argv.includes("--historical");
  const sendToArg = getArg("send-to") as "all" | "org" | "branches" | undefined;
  const sendTo = sendToArg ?? "all";

  if (!orgArg) {
    console.error("Uso: --org=<nombre o id> --override=<email>");
    process.exit(1);
  }
  if (!override) {
    console.error("--override es obligatorio para evitar envíos y cambios de preferencias en destinatarios reales.");
    process.exit(1);
  }

  const org = await resolveOrg(orgArg);
  console.log(`Organizacion: ${org.name} (${org.id})`);
  console.log(`Preview a: ${override}`);
  console.log("");

  // Email 1 y 2: reporte semanal (org + sucursales)
  // Ventana Mon-Sun: cuando se ejecuta en domingo, periodEnd = hoy, periodStart = hoy-6 (lunes)
  const today = new Date();
  const periodEndDate = new Date(today);           // domingo
  const periodStartDate = new Date(today);
  periodStartDate.setDate(periodStartDate.getDate() - 6); // lunes anterior
  const periodStart = periodStartDate.toISOString().slice(0, 10);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  console.log("Enviando email 1 (Prodel / org) y email 2 (sucursales)...");
  const result = await sendWeeklyInvoiceReport({
    organizationId: org.id,
    periodStart,
    periodEnd,
    isHistorical: historical,
    overrideRecipientEmail: override,
    recordRun: false,
    sendTo,
  });
  console.log("  Org emails enviados:", result.orgEmailsSent);
  console.log("  Branch emails enviados:", result.branchEmailsSent);
  console.log("  Branches sin email:", result.skippedBranches);

  console.log("\nListo.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
