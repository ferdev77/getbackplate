import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyDevelopmentReportValueSummary, summarizeDevelopmentReportPrices } from "./lib/development-report-classification.mjs";

const [sourceMigrationArgument, destinationArgument, version] = process.argv.slice(2);
if (!sourceMigrationArgument || !destinationArgument || !/^\d{14}$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/generate-development-report-summary.mjs <source-migration.sql> <destination.sql> <version>");
}

const sourceMigration = await readFile(resolve(sourceMigrationArgument), "utf8");
const sourceMatch = sourceMigration.match(/\$development_report_20260807000006\$([\s\S]*?)\$development_report_20260807000006\$/);
if (!sourceMatch) throw new Error("Unable to extract the reclassified development report HTML");
const html = applyDevelopmentReportValueSummary(sourceMatch[1]);
const counts = summarizeDevelopmentReportPrices(html);
const expected = { total: 57, nuevo: 37, mejora: 0, fix: 2, seg: 15, doc: 3 };
if (JSON.stringify(counts) !== JSON.stringify(expected)) throw new Error(`Unexpected initial badge summary: ${JSON.stringify(counts)}`);
const hash = createHash("sha256").update(html, "utf8").digest("hex");
const tag = `$development_report_${version}$`;
const migration = `ALTER TABLE public.development_ledger_reports DISABLE TRIGGER trg_prevent_development_report_mutation;\nUPDATE public.development_ledger_reports\nSET html_document = ${tag}${html}${tag},\n    content_sha256 = '${hash}',\n    snapshot = jsonb_set(snapshot, '{contentSha256}', to_jsonb('${hash}'::text), true),\n    updated_at = now()\nWHERE id = '20260807-0000-4000-8000-260807000004';\nALTER TABLE public.development_ledger_reports ENABLE TRIGGER trg_prevent_development_report_mutation;\n\nNOTIFY pgrst, 'reload schema';\n`;
await writeFile(resolve(destinationArgument), migration, "utf8");
console.log(`Generated badge value summary ${JSON.stringify(counts)} (sha256 ${hash}).`);
