import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [sourceArgument, destinationArgument] = process.argv.slice(2);
if (!sourceArgument || !destinationArgument) {
  throw new Error("Usage: node scripts/generate-development-ledger-seed.mjs <source.html> <destination.sql>");
}

const source = await readFile(resolve(sourceArgument), "utf8");

function objectLiteral(name) {
  const match = source.match(new RegExp(`var ${name} = (\\{[\\s\\S]*?\\n  \\});`));
  if (!match) throw new Error(`Unable to find ${name}`);
  return Function(`"use strict"; return (${match[1]});`)();
}

function text(html) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&rarr;|→/g, "->")
    .replace(/&[^;]+;/g, (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" }[entity] ?? entity))
    .replace(/\s+/g, " ")
    .trim();
}

function sql(value) {
  return value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`;
}

const dates = objectLiteral("FECHAS");
const previouslyInvoiced = objectLiteral("COBRADO");
const priorLabels = objectLiteral("RENGLON");
const prices = {
  "i1-12":"30","i1-13":"30","i2-1":"50","i2-3":"30","i2-6":"20","i2-7":"30","i2-8":"70","i2-11":"20","i5-3":"20","i6-4":"70","p1-7":"70","p1-10":"30","p1-11":"30","p2-9":"30","p3-1":"20","p3-3":"20","p4-2":"20","p4-3":"10","p4-6":"30","p5-1":"30","p6-1":"150","p6-2":"30","p6-5":"70","p6-8":"30","p6-7":"20","i8-total":"250","i3-5":"70","i5-1":"30","t2-total":"120","t5-total":"120","t1-total":"50"
};
const rows = [];
const sectionPattern = /<(article|section) class="section ([ipt])" id="([ipt]\d+)"[^>]*>([\s\S]*?)<\/\1>/g;
let sectionMatch;
let sectionIndex = 0;
while ((sectionMatch = sectionPattern.exec(source))) {
  sectionIndex += 1;
  const [, , planCode, sectionCode, body] = sectionMatch;
  const heading = body.match(/<h3>([\s\S]*?)<\/h3>/);
  if (!heading) throw new Error(`Missing heading for ${sectionCode}`);
  const sectionTitle = text(heading[1]);
  const planScope = planCode === "i" ? "integration" : planCode === "p" ? "platform" : "cross";
  const totalKey = `${sectionCode}-total`;
  if (prices[totalKey]) {
    rows.push({
      key: totalKey,
      date: sectionCode === "i8" ? "2026-08-06" : "2026-08-03",
      planScope,
      workType: sectionCode === "i8" ? "review" : sectionCode === "t1" ? "security" : "docs",
      sectionCode,
      sectionTitle,
      title: sectionTitle.replace(/^\d+\.\d+\s*·\s*/, ""),
      rationale: "Precio general del área.",
      technicalDetail: null,
      billingStatus: "to_invoice",
      amountCents: Number(prices[totalKey]) * 100,
      priorInvoiceLabel: null,
      sortOrder: sectionIndex * 1000,
    });
  }

  const entries = body.match(/<ul class="entries">([\s\S]*?)<\/ul>/)?.[1] ?? "";
  const entryPattern = /<li><span class="chip ([^"]+)">([\s\S]*?)<\/span><div>([\s\S]*?)<\/div><\/li>/g;
  let entryMatch;
  let entryIndex = 0;
  while ((entryMatch = entryPattern.exec(entries))) {
    entryIndex += 1;
    const key = `${sectionCode}-${entryIndex}`;
    const [, chipClass, chipText, entryBody] = entryMatch;
    const title = text(entryBody.match(/<p class="what">([\s\S]*?)<\/p>/)?.[1] ?? "");
    const rationale = text(entryBody.match(/<p class="why">([\s\S]*?)<\/p>/)?.[1] ?? "") || null;
    const technicalDetail = text(entryBody.match(/<p class="tech">([\s\S]*?)<\/p>/)?.[1] ?? "") || null;
    const normalizedChip = text(chipText).toLowerCase();
    const workType = chipClass.includes("seg") ? "security"
      : chipClass.includes("doc") ? (normalizedChip === "legal" ? "legal" : "docs")
      : chipClass.includes("fix") ? "fix"
      : normalizedChip === "review" ? "review"
      : "new";
    const priorCode = previouslyInvoiced[key];
    const amount = prices[key] ? Number(prices[key]) * 100 : null;
    rows.push({
      key,
      date: dates[key] ? `2026-${dates[key]}` : "2026-08-06",
      planScope,
      workType,
      sectionCode,
      sectionTitle,
      title,
      rationale,
      technicalDetail,
      billingStatus: priorCode ? "previously_invoiced" : amount ? "to_invoice" : "unpriced",
      amountCents: amount,
      priorInvoiceLabel: priorCode ? priorLabels[priorCode] : null,
      sortOrder: sectionIndex * 1000 + entryIndex * 10,
    });
  }
}

rows.push(
  {
    key: "i1-15", date: "2026-08-07", planScope: "integration", workType: "new", sectionCode: "i1",
    sectionTitle: rows.find((row) => row.sectionCode === "i1").sectionTitle,
    title: "El Account Number de cada cliente se puede cargar manualmente cuando QuickBooks no lo entrega.",
    rationale: "Evita bloquear la exportación a Restaurant365 cuando el dato no está disponible en la API de Intuit.",
    technicalDetail: "Edición manual de Account Number con persistencia por cliente.", billingStatus: "unpriced", amountCents: null,
    priorInvoiceLabel: null, sortOrder: 1990,
  },
  {
    key: "i7-6", date: "2026-08-07", planScope: "integration", workType: "fix", sectionCode: "i7",
    sectionTitle: rows.find((row) => row.sectionCode === "i7").sectionTitle,
    title: "El alta distingue de forma persistente si el cliente contrató integración o plataforma.",
    rationale: "El bloqueante de onboarding ya no reaparece por redirects, MFA o recargas, ni mezcla requisitos entre los dos planes.",
    technicalDetail: "billing_onboarding_track + aislamiento de bloqueantes por recorrido.", billingStatus: "unpriced", amountCents: null,
    priorInvoiceLabel: null, sortOrder: 7990,
  },
);

if (rows.length < 150) throw new Error(`Parsed only ${rows.length} rows`);
const total = rows.reduce((sum, row) => sum + (row.billingStatus === "to_invoice" ? row.amountCents ?? 0 : 0), 0);
if (total !== 160000) throw new Error(`Expected 160000 cents, found ${total}`);

const values = rows.map((row) => `  (${[
  sql(row.key), sql(row.date), sql(row.planScope), sql(row.workType), sql(row.sectionCode), sql(row.sectionTitle),
  sql(row.title), sql(row.rationale), sql(row.technicalDetail), sql(row.billingStatus), row.amountCents ?? "NULL",
  sql(row.priorInvoiceLabel), row.sortOrder,
].join(", ")})`).join(",\n");

const output = `-- Generated from the approved July-August 2026 development report.\nINSERT INTO public.development_ledger_items (\n  stable_key, occurred_on, plan_scope, work_type, section_code, section_title, title, rationale,\n  technical_detail, billing_status, amount_cents, prior_invoice_label, sort_order\n) VALUES\n${values}\nON CONFLICT (stable_key) DO NOTHING;\n\nNOTIFY pgrst, 'reload schema';\n`;

await writeFile(resolve(destinationArgument), output, "utf8");
console.log(`Generated ${rows.length} ledger rows totaling ${total} cents.`);
