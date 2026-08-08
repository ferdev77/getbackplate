import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { applyDevelopmentReportImprovements, IMPROVEMENT_KEYS } from "./lib/development-report-classification.mjs";

const [sourceMigrationArgument, destinationArgument, version] = process.argv.slice(2);
if (!sourceMigrationArgument || !destinationArgument || !/^\d{14}$/.test(version ?? "")) {
  throw new Error("Usage: node scripts/generate-development-report-reclassification.mjs <source-migration.sql> <destination.sql> <version>");
}

const sourceMigration = await readFile(resolve(sourceMigrationArgument), "utf8");
const sourceMatch = sourceMigration.match(/\$development_report_20260807000004\$([\s\S]*?)\$development_report_20260807000004\$/);
if (!sourceMatch) throw new Error("Unable to extract the initial development report HTML");
const html = applyDevelopmentReportImprovements(sourceMatch[1]);
const hash = createHash("sha256").update(html, "utf8").digest("hex");
const tag = `$development_report_${version}$`;
const keys = IMPROVEMENT_KEYS.map((key) => `'${key}'`).join(", ");

const migration = `ALTER TABLE public.development_ledger_items DROP CONSTRAINT IF EXISTS development_ledger_items_work_type_check;\nALTER TABLE public.development_ledger_items ADD CONSTRAINT development_ledger_items_work_type_check CHECK (work_type IN ('new', 'improvement', 'fix', 'security', 'legal', 'docs', 'review'));\n\nUPDATE public.development_ledger_items SET work_type = 'improvement', updated_at = now() WHERE stable_key IN (${keys});\n\nALTER TABLE public.development_ledger_reports DISABLE TRIGGER trg_prevent_development_report_mutation;\nUPDATE public.development_ledger_reports\nSET html_document = ${tag}${html}${tag},\n    content_sha256 = '${hash}',\n    snapshot = jsonb_set(snapshot, '{contentSha256}', to_jsonb('${hash}'::text), true),\n    updated_at = now()\nWHERE id = '20260807-0000-4000-8000-260807000004';\nALTER TABLE public.development_ledger_reports ENABLE TRIGGER trg_prevent_development_report_mutation;\n\nNOTIFY pgrst, 'reload schema';\n`;

await writeFile(resolve(destinationArgument), migration, "utf8");
console.log(`Generated ${IMPROVEMENT_KEYS.length} improvement classifications (sha256 ${hash}).`);
