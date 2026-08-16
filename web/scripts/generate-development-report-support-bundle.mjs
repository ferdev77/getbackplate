import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyDevelopmentReportSupportBundle } from "./lib/development-report-classification.mjs";

const [sourceMigrationArgument, destinationArgument, version] = process.argv.slice(2);
if (!sourceMigrationArgument || !destinationArgument || !/^\d{14}$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/generate-development-report-support-bundle.mjs <source-migration.sql> <destination.sql> <version>");
}
const sourceMigration = await readFile(resolve(sourceMigrationArgument), "utf8");
const sourceMatch = sourceMigration.match(/\$development_report_20260807000008\$([\s\S]*?)\$development_report_20260807000008\$/);
if (!sourceMatch) throw new Error("Unable to extract the owner-cleaned development report HTML");
const html = applyDevelopmentReportSupportBundle(sourceMatch[1]);
if (!html.includes('id="p7" data-single-price="true"') || !html.includes('data-price-key="p7-total"')) {
  throw new Error("Support section was not converted to one price");
}
const hash = createHash("sha256").update(html, "utf8").digest("hex");
const tag = `$development_report_${version}$`;
const migration = `ALTER TABLE public.development_ledger_reports DISABLE TRIGGER trg_prevent_development_report_mutation;\nWITH support_prices AS (\n  SELECT id, price_state,\n    coalesce(nullif(price_state ->> 'p7-1', '')::numeric, 0) +\n    coalesce(nullif(price_state ->> 'p7-2', '')::numeric, 0) +\n    coalesce(nullif(price_state ->> 'p7-3', '')::numeric, 0) +\n    coalesce(nullif(price_state ->> 'p7-4', '')::numeric, 0) AS support_total\n  FROM public.development_ledger_reports\n  WHERE id = '20260807-0000-4000-8000-260807000004'\n)\nUPDATE public.development_ledger_reports report\nSET html_document = ${tag}${html}${tag},\n    content_sha256 = '${hash}',\n    snapshot = jsonb_set(report.snapshot, '{contentSha256}', to_jsonb('${hash}'::text), true),\n    price_state = (support_prices.price_state - 'p7-1' - 'p7-2' - 'p7-3' - 'p7-4') ||\n      CASE WHEN support_prices.support_total > 0 THEN jsonb_build_object('p7-total', support_prices.support_total::text) ELSE '{}'::jsonb END,\n    updated_at = now()\nFROM support_prices\nWHERE report.id = support_prices.id;\nALTER TABLE public.development_ledger_reports ENABLE TRIGGER trg_prevent_development_report_mutation;\n\nNOTIFY pgrst, 'reload schema';\n`;
await writeFile(resolve(destinationArgument), migration, "utf8");
console.log(`Generated Support single-price section (sha256 ${hash}).`);
