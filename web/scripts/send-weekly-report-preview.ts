// Preview de los 3 emails del flujo de reporte semanal + referido.
//
// Uso:
//   node --env-file=.env.production.local node_modules/tsx/dist/cli.mjs scripts/send-weekly-report-preview.ts \
//     --org="Prodel" --override=tucorreo@ejemplo.com
//
// Envia a --override:
//   1. Email de Prodel (reporte org, sin CTA referido)
//   2. Email de sucursal Taco Palenque (con CTA referido)
//   3. Email de outreach al vendor referido

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { sendWeeklyInvoiceReport } from "@/modules/integrations/qbo-r365/services/weekly-invoice-report.service";
import { sendVendorReferral } from "@/modules/integrations/qbo-r365/services/vendor-referral.service";

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

async function getFirstCustomer(orgId: string): Promise<{ id: string; name: string } | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("qbo_r365_sync_config_customers")
    .select("id, qbo_customer_name")
    .eq("organization_id", orgId)
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { id: data.id as string, name: data.qbo_customer_name as string };
}

async function main() {
  const orgArg = getArg("org");
  const override = getArg("override");

  if (!orgArg || !override) {
    console.error("Uso: --org=<nombre o id> --override=<email>");
    process.exit(1);
  }

  const org = await resolveOrg(orgArg);
  console.log(`Organizacion: ${org.name} (${org.id})`);
  console.log(`Preview a: ${override}`);
  console.log("");

  // Email 1 y 2: reporte semanal (org + sucursales)
  const today = new Date();
  const periodEndDate = new Date(today);
  const periodStartDate = new Date(today);
  periodStartDate.setDate(periodStartDate.getDate() - 7);
  const periodStart = periodStartDate.toISOString().slice(0, 10);
  const periodEnd = periodEndDate.toISOString().slice(0, 10);

  console.log("Enviando email 1 (Prodel / org) y email 2 (sucursales)...");
  const result = await sendWeeklyInvoiceReport({
    organizationId: org.id,
    periodStart,
    periodEnd,
    isHistorical: false,
    overrideRecipientEmail: override,
    recordRun: false,
  });
  console.log("  Org email:", result.orgEmailSent ? "enviado" : "sin destinatario");
  console.log("  Branch emails enviados:", result.branchEmailsSent);
  console.log("  Branches sin email:", result.skippedBranches);
  console.log("");

  // Email 3: outreach al vendor referido
  const firstCustomer = await getFirstCustomer(org.id);
  if (!firstCustomer) {
    console.log("No se encontraron sucursales para preview del email 3.");
  } else {
    console.log(`Enviando email 3 (outreach vendor referido) desde "${firstCustomer.name}"...`);
    await sendVendorReferral({
      organizationId: org.id,
      syncConfigCustomerId: firstCustomer.id,
      referrerBranchName: firstCustomer.name,
      vendorCompany: "Acme Foods Distribution",
      vendorContactName: "John Smith",
      vendorEmail: override,
      vendorPhone: "+1 (555) 000-0000",
    });
    console.log("  Outreach email: enviado");
  }

  console.log("\nListo. Revisá tu bandeja de entrada en:", override);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
