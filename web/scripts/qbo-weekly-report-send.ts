// Disparo manual del reporte semanal de facturas QBO -> R365.
//
// Uso:
//   node --env-file=.env.production.local node_modules/tsx/dist/cli.mjs scripts/qbo-weekly-report-send.ts \
//     --org="Prodel Distribution" --mode=historical --override=alguien@ejemplo.com
//
// Args:
//   --org=<nombre o id de la organizacion>   (obligatorio)
//   --mode=historical|weekly                  (obligatorio)
//   --start=YYYY-MM-DD --end=YYYY-MM-DD        (solo para --mode=weekly)
//   --override=<email>                         (si se pasa, todo se manda a este email, modo prueba)
//   --record                                    (si se pasa, registra el envio en la tabla de control; nunca usar junto con --override)

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendWeeklyInvoiceReport } from "@/modules/integrations/qbo-r365/services/weekly-invoice-report.service";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function resolveOrganizationId(orgArg: string): Promise<{ id: string; name: string }> {
  const admin = createSupabaseAdminClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(orgArg);

  const { data, error } = isUuid
    ? await admin.from("organizations").select("id, name").eq("id", orgArg).maybeSingle()
    : await admin.from("organizations").select("id, name").ilike("name", `%${orgArg}%`).maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No se encontro organizacion para "${orgArg}"`);
  return { id: data.id, name: data.name };
}

async function main() {
  const orgArg = getArg("org");
  const mode = getArg("mode");
  const override = getArg("override");
  const record = hasFlag("record");
  const start = getArg("start");
  const end = getArg("end");

  if (!orgArg || (mode !== "historical" && mode !== "weekly")) {
    console.error("Uso: --org=<nombre o id> --mode=historical|weekly [--start=YYYY-MM-DD --end=YYYY-MM-DD] [--override=email] [--record]");
    process.exit(1);
  }

  if (record && override) {
    console.error("No uses --record junto con --override (un envio de prueba nunca debe marcarse como ya enviado).");
    process.exit(1);
  }

  if (mode === "weekly" && (!start || !end)) {
    console.error("--mode=weekly requiere --start y --end (YYYY-MM-DD).");
    process.exit(1);
  }

  const org = await resolveOrganizationId(orgArg);
  console.log(`Organizacion: ${org.name} (${org.id})`);
  console.log(`Modo: ${mode}${override ? ` | OVERRIDE -> ${override}` : ""}${record ? " | se registrara en la tabla de control" : ""}`);

  const result = await sendWeeklyInvoiceReport({
    organizationId: org.id,
    periodStart: mode === "weekly" ? start! : null,
    periodEnd: mode === "weekly" ? end! : null,
    isHistorical: mode === "historical",
    overrideRecipientEmail: override,
    recordRun: record,
  });

  console.log("Resultado:", result);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
