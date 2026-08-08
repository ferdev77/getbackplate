import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import Link from "next/link";
import { CalendarDays, Download, ExternalLink, FileArchive } from "lucide-react";
import { DevelopmentReportViewer } from "./report-viewer";

export const dynamic = "force-dynamic";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default async function DevelopmentLogPage({ searchParams }: { searchParams: Promise<{ report?: string }> }) {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  const isPublisher = user.email?.trim().toLowerCase() === "fer@soliz.com";
  const admin = createSupabaseAdminClient();
  let reportsQuery = admin
    .from("development_ledger_reports")
    .select("id, title, date_from, date_to, item_count, total_cents, currency, content_sha256, generated_at, publication_status, price_state, published_at")
    .order("date_from", { ascending: false })
    .order("generated_at", { ascending: false });
  if (!isPublisher) reportsQuery = reportsQuery.eq("publication_status", "published");
  const { data: reportRows, error: reportError } = await reportsQuery;
  if (reportError) throw new Error(`Unable to load development reports: ${reportError.message}`);
  const reports = reportRows ?? [];
  const requestedId = (await searchParams).report;
  const selected = reports.find((report) => report.id === requestedId) ?? reports[0] ?? null;

  return <PageContent spacing="roomy" className="space-y-6">
    <header className="flex flex-col gap-4 border-b border-[var(--gbp-border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gbp-accent)]">Archivo inmutable · SuperAdmin</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[var(--gbp-text)] sm:text-4xl">Registro de desarrollo</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--gbp-text2)]">{isPublisher ? "Los períodos llegan desde sesiones de IA. Puedes ajustar sus precios mientras estén en borrador y publicarlos cuando estén listos." : "Aquí sólo aparecen períodos publicados. Los borradores son privados y su contenido no puede modificarse desde esta cuenta."}</p>
      </div>
      {selected && <div className="flex gap-2">
        <a href={`/api/superadmin/development-reports/${selected.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]">Abrir aparte <ExternalLink className="h-4 w-4" /></a>
        <a href={`/api/superadmin/development-reports/${selected.id}?download=1`} className="inline-flex items-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white"><Download className="h-4 w-4" /> Descargar HTML</a>
      </div>}
    </header>

    {reports.length > 0 && <nav aria-label="Períodos publicados" className="flex gap-3 overflow-x-auto pb-1">
      {reports.map((report) => {
        const active = report.id === selected?.id;
        return <Link key={report.id} href={`/superadmin/development-log?report=${report.id}`} className={`min-w-64 rounded-2xl border p-4 transition ${active ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:border-[var(--gbp-accent)]/50"}`}>
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--gbp-accent)]"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(report.date_from)} - {dateLabel(report.date_to)}</span>
          <span className="mt-2 flex items-center gap-2"><strong className="block text-sm text-[var(--gbp-text)]">{report.title}</strong>{report.publication_status === "draft" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">Borrador</span>}</span>
          <span className="mt-1 block text-xs text-[var(--gbp-muted)]">{report.item_count} entregas · {report.publication_status === "published" ? "publicado" : "privado"}</span>
        </Link>;
      })}
    </nav>}

    {selected ? <DevelopmentReportViewer
      key={selected.id}
      reportId={selected.id}
      title={selected.title}
      editable={isPublisher && selected.publication_status === "draft"}
      initialPrices={selected.price_state && typeof selected.price_state === "object" && !Array.isArray(selected.price_state) ? Object.fromEntries(Object.entries(selected.price_state).map(([key, value]) => [key, String(value)])) : {}}
    /> : <section className="grid min-h-96 place-items-center rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-center">
      <div><FileArchive className="mx-auto h-10 w-10 text-[var(--gbp-muted)]" /><h2 className="mt-4 font-black text-[var(--gbp-text)]">Todavía no hay períodos publicados</h2><p className="mt-1 text-sm text-[var(--gbp-muted)]">El próximo informe se incorporará mediante una sesión de IA.</p></div>
    </section>}
  </PageContent>;
}
