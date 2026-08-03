// Envia el reporte semanal de owner (operaciones QBO) a un solo destinatario.
//
// A diferencia del cron, esto NO le manda nada a los clientes: usa el override
// de destinatario y deja intacto OWNER_WEEKLY_REPORT_EMAIL.
//
// Uso:
//   node --env-file=.env.production.local node_modules/tsx/dist/cli.mjs \
//     scripts/send-owner-weekly-report.ts --to=dev@mkthelp.com [--days=7]

import { sendOwnerWeeklyOpsReport } from "@/modules/integrations/qbo-r365/services/owner-weekly-ops.service";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const to = getArg("to");
  if (!to) {
    throw new Error("Falta --to=correo@destino: sin eso iria a la lista de owners configurada.");
  }

  const days = Number(getArg("days") ?? "7");
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);

  console.log(`Enviando reporte de owner a ${to}`);
  console.log(`Periodo: ${isoDate(periodStart)} → ${isoDate(periodEnd)}`);

  const result = await sendOwnerWeeklyOpsReport({
    periodStart: isoDate(periodStart),
    periodEnd: isoDate(periodEnd),
    overrideRecipientEmail: to,
  });

  console.log(result.sent ? "Enviado." : `No se envio: ${result.reason ?? "sin motivo"}`);
  if (!result.sent) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
