import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyDevelopmentReportImprovements, applyDevelopmentReportValueSummary } from "./lib/development-report-classification.mjs";

const [sourceArgument, destinationArgument, version, title, dateFrom, dateTo, itemCountArgument, totalCentsArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument || !/^\d{14}$/.test(version ?? "") || !title || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo ?? "")) {
  throw new Error("Usage: node scripts/generate-development-report-migration.mjs <source.html> <destination.sql> <version> <title> <date-from> <date-to> <item-count> <total-cents>");
}
const itemCount = Number(itemCountArgument);
const totalCents = Number(totalCentsArgument);
if (!Number.isInteger(itemCount) || itemCount < 0 || !Number.isInteger(totalCents) || totalCents < 0) throw new Error("Invalid report totals");

let html = await readFile(resolve(sourceArgument), "utf8");
const legacyPrices = {"i1-12":"30","i1-13":"30","i2-1":"50","i2-3":"30","i2-6":"20","i2-7":"30","i2-8":"70","i2-11":"20","i5-3":"20","i6-4":"70","p1-7":"70","p1-10":"30","p1-11":"30","p2-9":"30","p3-1":"20","p3-3":"20","p4-2":"20","p4-3":"10","p4-6":"30","p5-1":"30","p6-1":"150","p6-2":"30","p6-5":"70","p6-8":"30","p6-7":"20","i8-total":"250","i3-5":"70","i5-1":"30","t2-total":"120","t5-total":"120","t1-total":"50"};
let initialPrices = {};
if (html.includes("gbp-borrador-precios-v4")) {
  initialPrices = legacyPrices;
  html = html
    .replace("var precios = leer(CLAVE);", `var precios = ${JSON.stringify(legacyPrices)};`)
    .replace("var estados = leer(CLAVE_ESTADO);", "var estados = {};")
    .replaceAll(">Cobrado<", ">Facturado anteriormente<")
    .replaceAll('"Cobrado"', '"Facturado anteriormente"')
    .replaceAll("marcadas <b>Cobrado</b>", "marcadas <b>Facturado anteriormente</b>")
    .replaceAll("Ítems cobrados", "Ítems facturados anteriormente");
  html = applyDevelopmentReportImprovements(html);
  html = applyDevelopmentReportValueSummary(html);
}

const hash = createHash("sha256").update(html, "utf8").digest("hex");
const reportId = `${version.slice(0, 8)}-${version.slice(8, 12)}-4000-8000-${version.slice(2, 14)}`;
const tag = `$development_report_${version}$`;
if (html.includes(tag)) throw new Error("HTML contains the SQL delimiter");
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;
const snapshot = JSON.stringify({ version: 1, source: "ai_session_html", title, dateFrom, dateTo, itemCount, totalCents, contentSha256: hash });
const migration = `DROP POLICY IF EXISTS development_ledger_items_superadmin_all ON public.development_ledger_items;\nDROP POLICY IF EXISTS development_ledger_items_superadmin_select ON public.development_ledger_items;\nCREATE POLICY development_ledger_items_superadmin_select ON public.development_ledger_items FOR SELECT TO authenticated USING (public.is_superadmin());\nDROP POLICY IF EXISTS development_ledger_reports_superadmin_insert ON public.development_ledger_reports;\n\nINSERT INTO public.development_ledger_reports (id, title, date_from, date_to, template_version, item_count, total_cents, currency, snapshot, html_document, content_sha256, generated_by, publication_status, price_state)\nVALUES (${sqlString(reportId)}, ${sqlString(title)}, ${sqlString(dateFrom)}, ${sqlString(dateTo)}, 1, ${itemCount}, ${totalCents}, 'USD', ${sqlString(snapshot)}::jsonb, ${tag}${html}${tag}, ${sqlString(hash)}, NULL, 'draft', ${sqlString(JSON.stringify(initialPrices))}::jsonb)\nON CONFLICT (id) DO NOTHING;\n\nNOTIFY pgrst, 'reload schema';\n`;
await writeFile(resolve(destinationArgument), migration, "utf8");
console.log(`Generated immutable report ${reportId} (${html.length} characters, sha256 ${hash}).`);
