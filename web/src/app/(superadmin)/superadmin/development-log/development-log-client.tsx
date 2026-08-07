"use client";

import { useDeferredValue, useState, useTransition } from "react";
import { ArrowUpRight, Download, FileCheck2, Filter, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import {
  BILLING_STATUS_LABELS,
  LEDGER_BILLING_STATUSES,
  LEDGER_PLAN_SCOPES,
  LEDGER_WORK_TYPES,
  PLAN_LABELS,
  WORK_TYPE_LABELS,
} from "@/modules/superadmin/development-ledger/types";
import type { DevelopmentLedgerItem, DevelopmentLedgerReport } from "@/modules/superadmin/development-ledger/types";
import { createLedgerItemAction, generateLedgerReportAction, updateLedgerBillingAction } from "./actions";

type Draft = { billingStatus: string; amount: string };

function dollars(cents: number) {
  return `US$ ${new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(cents / 100)}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

function inputClass() {
  return "h-10 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)] outline-none transition focus:border-[var(--gbp-accent)] focus:ring-2 focus:ring-[var(--gbp-accent-glow)]";
}

export function DevelopmentLogClient({ items, reports }: { items: DevelopmentLedgerItem[]; reports: DevelopmentLedgerReport[] }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const [dateFrom, setDateFrom] = useState("2026-07-01");
  const [dateTo, setDateTo] = useState("2026-08-07");
  const [plan, setPlan] = useState("all");
  const [workType, setWorkType] = useState("all");
  const [billingStatus, setBillingStatus] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(items.map((item) => [item.id, {
    billingStatus: item.billingStatus,
    amount: item.amountCents === null ? "" : String(item.amountCents / 100),
  }])));

  const filtered = items.filter((item) => {
    const haystack = `${item.title} ${item.sectionTitle} ${item.rationale ?? ""} ${item.technicalDetail ?? ""}`.toLowerCase();
    return (!deferredQuery || haystack.includes(deferredQuery))
      && (!dateFrom || item.occurredOn >= dateFrom)
      && (!dateTo || item.occurredOn <= dateTo)
      && (plan === "all" || item.planScope === plan)
      && (workType === "all" || item.workType === workType)
      && (billingStatus === "all" || (drafts[item.id]?.billingStatus ?? item.billingStatus) === billingStatus);
  });
  const visibleTotal = filtered.reduce((sum, item) => {
    const draft = drafts[item.id];
    return sum + (draft?.billingStatus === "to_invoice" ? Math.round(Number(draft.amount || 0) * 100) : 0);
  }, 0);

  function saveBilling(item: DevelopmentLedgerItem, next: Draft) {
    setDrafts((current) => ({ ...current, [item.id]: next }));
    const amount = next.amount.trim() === "" ? null : Math.round(Number(next.amount) * 100);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      toast.error("El precio debe ser un número positivo");
      return;
    }
    startTransition(async () => {
      const result = await updateLedgerBillingAction({ id: item.id, billingStatus: next.billingStatus, amountCents: amount });
      if (!result.ok) toast.error(result.error);
      else toast.success("Facturación actualizada");
    });
  }

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[28px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm sm:p-8">
        <div className="absolute inset-y-0 right-0 w-2/5 bg-[radial-gradient(circle_at_top_right,var(--gbp-accent-glow),transparent_68%)]" />
        <div className="relative max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gbp-accent)]">SuperAdmin · Registro interno</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.035em] text-[var(--gbp-text)] sm:text-5xl">Registro de desarrollo</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--gbp-text2)] sm:text-base">Clasifica el trabajo entregado, define qué se factura y cierra informes HTML que ya no pueden modificarse.</p>
        </div>
        <div className="relative mt-7 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)]/70 p-4"><p className="text-xs font-bold uppercase tracking-wider text-[var(--gbp-muted)]">Entregas visibles</p><p className="mt-1 text-2xl font-black text-[var(--gbp-text)]">{filtered.filter((item) => !item.stableKey?.endsWith("-total")).length}</p></div>
          <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)]/70 p-4"><p className="text-xs font-bold uppercase tracking-wider text-[var(--gbp-muted)]">Por facturar</p><p className="mt-1 text-2xl font-black text-[var(--gbp-accent)]">{dollars(visibleTotal)}</p></div>
          <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)]/70 p-4"><p className="text-xs font-bold uppercase tracking-wider text-[var(--gbp-muted)]">Informes cerrados</p><p className="mt-1 text-2xl font-black text-[var(--gbp-text)]">{reports.length}</p></div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
          <div className="flex items-center gap-2"><Filter className="h-4 w-4 text-[var(--gbp-accent)]" /><h2 className="font-black text-[var(--gbp-text)]">Explorar entregas</h2></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="relative md:col-span-2 xl:col-span-3"><span className="sr-only">Buscar</span><Search className="absolute left-3 top-3 h-4 w-4 text-[var(--gbp-muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por entrega, área o detalle técnico" className={`${inputClass()} w-full pl-10`} /></label>
            <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Desde<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className={inputClass()} /></label>
            <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Hasta<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className={inputClass()} /></label>
            <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Plan<select value={plan} onChange={(event) => setPlan(event.target.value)} className={inputClass()}><option value="all">Todos</option>{LEDGER_PLAN_SCOPES.map((value) => <option key={value} value={value}>{PLAN_LABELS[value]}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Tipo<select value={workType} onChange={(event) => setWorkType(event.target.value)} className={inputClass()}><option value="all">Todos</option>{LEDGER_WORK_TYPES.map((value) => <option key={value} value={value}>{WORK_TYPE_LABELS[value]}</option>)}</select></label>
            <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Facturación<select value={billingStatus} onChange={(event) => setBillingStatus(event.target.value)} className={inputClass()}><option value="all">Todos</option>{LEDGER_BILLING_STATUSES.map((value) => <option key={value} value={value}>{BILLING_STATUS_LABELS[value]}</option>)}</select></label>
          </div>
        </div>

        <ReportGenerator dateFrom={dateFrom} dateTo={dateTo} pending={pending} onGenerate={(input) => startTransition(async () => {
          const result = await generateLedgerReportAction(input);
          if (!result.ok) toast.error(result.error);
          else {
            toast.success("Informe cerrado y guardado");
            window.open(`/api/superadmin/development-reports/${result.reportId}`, "_blank", "noopener,noreferrer");
          }
        })} />
      </section>

      <AddItemForm pending={pending} />

      <section className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
        <div className="border-b border-[var(--gbp-border)] px-5 py-4"><h2 className="font-black text-[var(--gbp-text)]">{filtered.length} registros</h2><p className="text-xs text-[var(--gbp-muted)]">Los cambios guardados afectan informes futuros; nunca alteran snapshots cerrados.</p></div>
        <div className="divide-y divide-[var(--gbp-border)]">
          {filtered.map((item) => {
            const draft = drafts[item.id] ?? { billingStatus: item.billingStatus, amount: item.amountCents === null ? "" : String(item.amountCents / 100) };
            return <article key={item.id} className="grid gap-4 p-5 transition hover:bg-[var(--gbp-bg)]/60 lg:grid-cols-[130px_minmax(0,1fr)_220px]">
              <div><p className="text-xs font-black uppercase tracking-wider text-[var(--gbp-accent)]">{PLAN_LABELS[item.planScope]}</p><p className="mt-1 text-xs text-[var(--gbp-muted)]">{dateLabel(item.occurredOn)}</p><span className="mt-2 inline-flex rounded-md border border-[var(--gbp-border)] px-2 py-1 text-[10px] font-black uppercase text-[var(--gbp-text2)]">{WORK_TYPE_LABELS[item.workType]}</span></div>
              <div className="min-w-0"><p className="text-xs font-bold text-[var(--gbp-muted)]">{item.sectionTitle}</p><h3 className="mt-1 font-bold leading-6 text-[var(--gbp-text)]">{item.title}</h3>{item.rationale && <p className="mt-1 text-sm leading-5 text-[var(--gbp-text2)]">{item.rationale}</p>}{item.technicalDetail && <p className="mt-2 break-words font-mono text-xs leading-5 text-[var(--gbp-muted)]">{item.technicalDetail}</p>}{item.priorInvoiceLabel && <p className="mt-2 text-xs italic text-[var(--gbp-muted)]">{item.priorInvoiceLabel}</p>}</div>
              <div className="grid content-start gap-2 sm:grid-cols-2 lg:grid-cols-1">
                <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Estado<select disabled={pending} value={draft.billingStatus} onChange={(event) => saveBilling(item, { ...draft, billingStatus: event.target.value })} className={inputClass()}>{LEDGER_BILLING_STATUSES.map((value) => <option key={value} value={value}>{BILLING_STATUS_LABELS[value]}</option>)}</select></label>
                {draft.billingStatus === "to_invoice" && <label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Precio (USD)<input disabled={pending} type="number" min="0" step="0.01" value={draft.amount} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, amount: event.target.value } }))} onBlur={() => saveBilling(item, draft)} placeholder="0.00" className={inputClass()} /></label>}
              </div>
            </article>;
          })}
          {filtered.length === 0 && <p className="p-10 text-center text-sm text-[var(--gbp-muted)]">No hay entregas para estos filtros.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
        <div className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-[var(--gbp-accent)]" /><h2 className="font-black text-[var(--gbp-text)]">Informes inmutables</h2></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {reports.map((report) => <article key={report.id} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)]/60 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[var(--gbp-text)]">{report.title}</h3><p className="mt-1 text-xs text-[var(--gbp-muted)]">{dateLabel(report.dateFrom)} al {dateLabel(report.dateTo)} · {report.itemCount} entregas</p></div><strong className="text-sm text-[var(--gbp-accent)]">{dollars(report.totalCents)}</strong></div><div className="mt-4 flex gap-2"><a href={`/api/superadmin/development-reports/${report.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs font-bold text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]">Abrir <ArrowUpRight className="h-3.5 w-3.5" /></a><a href={`/api/superadmin/development-reports/${report.id}?download=1`} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--gbp-accent)] px-3 py-2 text-xs font-bold text-white"><Download className="h-3.5 w-3.5" /> HTML</a></div></article>)}
          {reports.length === 0 && <p className="text-sm text-[var(--gbp-muted)]">Todavía no hay informes cerrados.</p>}
        </div>
      </section>
    </div>
  );
}

function ReportGenerator({ dateFrom, dateTo, pending, onGenerate }: { dateFrom: string; dateTo: string; pending: boolean; onGenerate: (input: { title: string; dateFrom: string; dateTo: string }) => void }) {
  const [title, setTitle] = useState("Registro de desarrollo · julio-agosto 2026");
  return <form onSubmit={(event) => { event.preventDefault(); onGenerate({ title, dateFrom, dateTo }); }} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm"><p className="text-xs font-black uppercase tracking-wider text-[var(--gbp-accent)]">Cerrar período</p><h2 className="mt-1 text-lg font-black text-[var(--gbp-text)]">Generar snapshot HTML</h2><p className="mt-1 text-xs leading-5 text-[var(--gbp-muted)]">Usa el rango activo de los filtros. Una vez generado no se puede editar ni borrar.</p><label className="mt-4 grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Título<input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass()} /></label><button disabled={pending || !dateFrom || !dateTo} className="mt-3 w-full rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-50">{pending ? "Generando..." : "Cerrar informe"}</button></form>;
}

function AddItemForm({ pending }: { pending: boolean }) {
  const [open, setOpen] = useState(false);
  const [submitting, startSubmitting] = useTransition();
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm"><summary className="flex cursor-pointer list-none items-center gap-2 font-black text-[var(--gbp-text)]"><Plus className="h-4 w-4 text-[var(--gbp-accent)]" />Registrar nueva entrega</summary>{open && <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); startSubmitting(async () => { const result = await createLedgerItemAction({ occurredOn: String(data.get("occurredOn")), planScope: String(data.get("planScope")), workType: String(data.get("workType")), sectionCode: String(data.get("sectionCode")), sectionTitle: String(data.get("sectionTitle")), title: String(data.get("title")), rationale: String(data.get("rationale")), technicalDetail: String(data.get("technicalDetail")) }); if (!result.ok) toast.error(result.error); else { toast.success("Entrega registrada"); form.reset(); setOpen(false); } }); }}><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Fecha<input required name="occurredOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={inputClass()} /></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Plan<select name="planScope" className={inputClass()}>{LEDGER_PLAN_SCOPES.map((value) => <option key={value} value={value}>{PLAN_LABELS[value]}</option>)}</select></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Tipo<select name="workType" className={inputClass()}>{LEDGER_WORK_TYPES.map((value) => <option key={value} value={value}>{WORK_TYPE_LABELS[value]}</option>)}</select></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Código de área<input required name="sectionCode" placeholder="i9" pattern="[a-z][a-z0-9-]{0,29}" className={inputClass()} /></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)] md:col-span-2">Nombre del área<input required name="sectionTitle" maxLength={300} placeholder="1.9 · Nueva área" className={inputClass()} /></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)] md:col-span-2">Entrega<textarea required name="title" maxLength={1000} rows={2} className={`${inputClass()} h-auto py-2`} /></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Por qué importa<textarea name="rationale" maxLength={5000} rows={3} className={`${inputClass()} h-auto py-2`} /></label><label className="grid gap-1 text-xs font-bold text-[var(--gbp-muted)]">Detalle técnico<textarea name="technicalDetail" maxLength={5000} rows={3} className={`${inputClass()} h-auto py-2 font-mono`} /></label><button disabled={pending || submitting} className="rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50 md:col-span-2">{submitting ? "Guardando..." : "Registrar entrega"}</button></form>}</details>;
}
