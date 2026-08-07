import { BILLING_STATUS_LABELS, PLAN_LABELS, WORK_TYPE_LABELS } from "./types";
import type { DevelopmentLedgerItem, DevelopmentLedgerSnapshot, LedgerPlanScope } from "./types";

const PLAN_ORDER: LedgerPlanScope[] = ["integration", "platform", "cross"];

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMoney(cents: number, currency = "USD") {
  const value = new Intl.NumberFormat("es-MX", {
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
  return currency === "USD" ? `US$ ${value}` : `${currency} ${value}`;
}

export function calculateLedgerTotal(items: DevelopmentLedgerItem[]) {
  return items.reduce((total, item) => total + (item.billingStatus === "to_invoice" ? item.amountCents ?? 0 : 0), 0);
}

export function createLedgerSnapshot(input: Omit<DevelopmentLedgerSnapshot, "version" | "currency">): DevelopmentLedgerSnapshot {
  return { version: 1, currency: "USD", ...input };
}

function renderItem(item: DevelopmentLedgerItem, currency: string) {
  const amount = item.billingStatus === "to_invoice" && item.amountCents !== null
    ? `<span class="amount">${escapeHtml(formatMoney(item.amountCents, currency))}</span>`
    : "";
  const priorLabel = item.priorInvoiceLabel
    ? `<span class="prior">${escapeHtml(item.priorInvoiceLabel)}</span>`
    : "";
  const status = `<span class="status status-${item.billingStatus}">${escapeHtml(BILLING_STATUS_LABELS[item.billingStatus])}</span>`;
  const rationale = item.rationale ? `<p class="why">${escapeHtml(item.rationale)}</p>` : "";
  const technicalDetail = item.technicalDetail ? `<p class="tech">${escapeHtml(item.technicalDetail)}</p>` : "";

  if (item.stableKey?.endsWith("-total")) {
    return `<div class="section-price"><div><strong>${escapeHtml(item.title)}</strong><span>Precio general del área</span></div><div class="billing">${status}${amount}${priorLabel}</div></div>`;
  }

  return `<li><div class="entry-meta"><span class="chip chip-${item.workType}">${escapeHtml(WORK_TYPE_LABELS[item.workType])}</span><time>${escapeHtml(formatDate(item.occurredOn, { year: undefined }))}</time></div><div><p class="what">${escapeHtml(item.title)}</p>${rationale}${technicalDetail}<div class="billing">${status}${amount}${priorLabel}</div></div></li>`;
}

function renderPlan(snapshot: DevelopmentLedgerSnapshot, planScope: LedgerPlanScope) {
  const planItems = snapshot.items.filter((item) => item.planScope === planScope);
  if (planItems.length === 0) return "";
  const sections = new Map<string, DevelopmentLedgerItem[]>();
  for (const item of planItems) {
    const sectionItems = sections.get(item.sectionCode) ?? [];
    sectionItems.push(item);
    sections.set(item.sectionCode, sectionItems);
  }
  const planClass = planScope === "integration" ? "i" : planScope === "platform" ? "p" : "t";
  const sectionHtml = [...sections.entries()].map(([sectionCode, items]) => {
    const priced = items.find((item) => item.stableKey?.endsWith("-total"));
    const entries = items.filter((item) => !item.stableKey?.endsWith("-total"));
    return `<article class="section ${planClass}" id="${escapeHtml(sectionCode)}"><h3>${escapeHtml(items[0].sectionTitle)}</h3>${priced ? renderItem(priced, snapshot.currency) : ""}<ul class="entries">${entries.map((item) => renderItem(item, snapshot.currency)).join("")}</ul></article>`;
  }).join("");
  return `<section class="part-head ${planClass}"><p class="kicker">${sections.size} áreas</p><h2>${escapeHtml(PLAN_LABELS[planScope])}</h2></section>${sectionHtml}`;
}

export function renderDevelopmentLedgerReport(snapshot: DevelopmentLedgerSnapshot) {
  const regularItems = snapshot.items.filter((item) => !item.stableKey?.endsWith("-total"));
  const total = calculateLedgerTotal(snapshot.items);
  const days = new Set(regularItems.map((item) => item.occurredOn)).size;
  const counts = {
    new: regularItems.filter((item) => item.workType === "new").length,
    fix: regularItems.filter((item) => item.workType === "fix").length,
    security: regularItems.filter((item) => item.workType === "security").length,
    sections: new Set(regularItems.map((item) => `${item.planScope}:${item.sectionCode}`)).size,
  };
  const title = escapeHtml(snapshot.title);

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
*,*::before,*::after{box-sizing:border-box}body,h1,h2,h3,p,ol,ul{margin:0}body{--paper:#f7f8fc;--panel:#fff;--panel-alt:#f3f4fa;--ink:#111827;--ink-2:#47506b;--muted:#737d99;--rule:#e2e5f0;--i:#b4430f;--is:#fbeee6;--p:#5a37e8;--ps:#eeeaff;--t:#0d7f77;--ts:#e2f2f0;--green:#0f7a3d;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}.wrap{max-width:1120px;margin:auto;padding:0 clamp(1rem,4vw,2.75rem) 5rem}.masthead{padding:clamp(2.5rem,6vw,4.25rem) 0 2rem;border-bottom:1px solid #ccd1e2}.eyebrow,.kicker,time{font:700 .7rem/1.4 ui-monospace,Consolas,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}h1,h2{font-family:Georgia,serif;letter-spacing:-.02em}h1{font-size:clamp(2.2rem,5.4vw,3.6rem);line-height:1.05;margin:.9rem 0}h1 em{font-style:normal;color:var(--i)}.lede{max-width:65ch;color:var(--ink-2)}.period{display:inline-block;margin-top:1.2rem;padding:.35rem .8rem;border:1px solid var(--rule);border-radius:999px;background:var(--panel-alt);font:700 .75rem ui-monospace,monospace}.figures{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:1px;margin-top:2.5rem;border:1px solid var(--rule);border-radius:10px;overflow:hidden;background:var(--rule)}.figure{padding:1.2rem;background:var(--panel)}.figure b{display:block;font:2rem/1 Georgia,serif}.figure span{font-size:.78rem;color:var(--muted)}.legend{display:flex;flex-wrap:wrap;gap:.6rem 1rem;margin:1.5rem 0;padding:1rem;border:1px solid var(--rule);border-radius:10px;background:var(--panel-alt);font-size:.82rem;color:var(--ink-2)}.part-head{margin-top:3.4rem;padding-top:1.4rem;border-top:2px solid}.part-head.i{color:var(--i)}.part-head.p{color:var(--p)}.part-head.t{color:var(--t)}.part-head h2{color:var(--ink);font-size:2rem}.section{--accent:#777;--soft:var(--panel-alt);margin-top:1.15rem;padding:1.4rem 1.5rem;border:1px solid var(--rule);border-left:3px solid var(--accent);border-radius:8px;background:var(--panel);box-shadow:0 12px 28px -22px #11182766}.section.i{--accent:var(--i);--soft:var(--is)}.section.p{--accent:var(--p);--soft:var(--ps)}.section.t{--accent:var(--t);--soft:var(--ts)}.section h3{font-size:1.05rem}.entries{list-style:none;padding:0;margin-top:1rem}.entries li{display:grid;grid-template-columns:7.2rem 1fr;gap:1rem;padding:.85rem 0;border-top:1px solid var(--rule)}.entry-meta{display:flex;flex-direction:column;align-items:flex-start;gap:.45rem}.chip,.status,.amount,.prior{display:inline-flex;padding:.18rem .5rem;border-radius:4px;font:700 .64rem/1.4 ui-monospace,monospace;text-transform:uppercase}.chip{color:var(--accent);background:var(--soft)}.chip-fix{color:var(--ink-2);border:1px solid #ccd1e2;background:var(--panel-alt)}.chip-security{color:#9a5b06;background:#fbf0dd}.chip-legal,.chip-docs{color:var(--muted);border:1px dashed #ccd1e2;background:transparent}.what{font-size:.95rem}.why{margin-top:.25rem;color:var(--ink-2);font-size:.87rem}.tech{margin-top:.4rem;color:var(--muted);font: .73rem/1.55 ui-monospace,monospace}.tech::before{content:"▸ "}.billing{display:flex;align-items:center;flex-wrap:wrap;gap:.45rem;margin-top:.5rem}.status{letter-spacing:.04em}.status-to_invoice{color:var(--i);background:var(--is)}.status-previously_invoiced{color:var(--green);background:#e4f3ea}.status-included,.status-unpriced{color:var(--muted);border:1px dashed #ccd1e2}.amount{font-size:.78rem;color:var(--ink);border:1px solid var(--accent)}.prior{color:var(--muted);font-family:system-ui;text-transform:none;font-style:italic}.section-price{display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-top:1rem;padding:.9rem 1rem;border:1px solid var(--accent);border-radius:8px;background:var(--soft)}.section-price>div:first-child{display:grid}.section-price span{font-size:.76rem;color:var(--ink-2)}.closing{margin-top:3rem;padding-top:1.5rem;border-top:1px solid #ccd1e2;color:var(--muted);font-size:.85rem}.total{position:sticky;bottom:0;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1rem clamp(1rem,4vw,2.75rem);background:var(--panel);border-top:1px solid #ccd1e2;box-shadow:0 -8px 24px -18px #000}.total b{font:700 1.2rem ui-monospace,monospace}@media(max-width:560px){.entries li{grid-template-columns:1fr}.section{padding:1.1rem}.section-price{align-items:flex-start;flex-direction:column}}@media print{.total{position:static}.wrap{padding-bottom:1rem}}
</style></head><body><div class="wrap"><header class="masthead"><p class="eyebrow">GetBackplate · Registro de desarrollo</p><h1>Trabajo realizado y <em>valor entregado</em></h1><p class="lede">${title}. Entregas registradas, clasificadas y cerradas desde el historial interno de desarrollo.</p><p class="period">${escapeHtml(formatDate(snapshot.dateFrom))} → ${escapeHtml(formatDate(snapshot.dateTo))}</p></header><section class="figures"><div class="figure"><b>${regularItems.length}</b><span>entregas registradas</span></div><div class="figure"><b>${counts.new}</b><span>funciones nuevas</span></div><div class="figure"><b>${counts.fix}</b><span>correcciones</span></div><div class="figure"><b>${counts.security}</b><span>mejoras de seguridad</span></div><div class="figure"><b>${counts.sections}</b><span>áreas de trabajo</span></div><div class="figure"><b>${days}</b><span>días con entregas</span></div></section><div class="legend"><span>Integración</span><span>Plataforma</span><span>Transversal</span><span>Facturado anteriormente</span><span>Por facturar</span><span>Incluido</span></div><main>${PLAN_ORDER.map((plan) => renderPlan(snapshot, plan)).join("")}</main><div class="closing"><p><b>Alcance.</b> Este documento es un snapshot inmutable de ${regularItems.length} entregas entre ${escapeHtml(formatDate(snapshot.dateFrom))} y ${escapeHtml(formatDate(snapshot.dateTo))}.</p><p><b>Generado.</b> ${escapeHtml(new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(snapshot.generatedAt)))} UTC.</p></div></div><div class="total"><span>Total por facturar</span><b>${escapeHtml(formatMoney(total, snapshot.currency))}</b></div></body></html>`;
}
