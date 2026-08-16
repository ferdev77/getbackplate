import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { requireAuthenticatedUser, requireSuperadmin } from "@/shared/lib/access";
import { PageContent } from "@/shared/ui/page-content";
import Link from "next/link";
import { CalendarDays, Eye, FileArchive } from "lucide-react";
import { PublishReportButton } from "./publish-report-button";

export const dynamic = "force-dynamic";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export default async function DevelopmentLogPage() {
  const user = await requireAuthenticatedUser();
  await requireSuperadmin();
  const isPublisher = user.email?.trim().toLowerCase() === "fer@soliz.com";
  const admin = createSupabaseAdminClient();
  let reportsQuery = admin
    .from("development_ledger_reports")
    .select("id, title, date_from, date_to, item_count, generated_at, publication_status")
    .order("date_from", { ascending: false })
    .order("generated_at", { ascending: false });
  if (!isPublisher) reportsQuery = reportsQuery.eq("publication_status", "published");
  const { data: reportRows, error: reportError } = await reportsQuery;
  if (reportError) throw new Error(`Unable to load development reports: ${reportError.message}`);
  const reports = reportRows ?? [];

  return <PageContent spacing="roomy" className="space-y-6">
    <header className="border-b border-[var(--gbp-border)] pb-6">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--gbp-accent)]">Dev · SuperAdmin</p>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-[var(--gbp-text)] sm:text-4xl">Registro de desarrollo</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--gbp-text2)]">{isPublisher ? "Abre un período para revisar y ajustar sus precios. Publícalo desde su tarjeta cuando esté listo." : "Aquí sólo aparecen los períodos publicados."}</p>
      </div>
    </header>

    {reports.length > 0 ? <section aria-label="Períodos de desarrollo" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {reports.map((report) => {
        return <article key={report.id} className="flex min-h-48 flex-col rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--gbp-accent)]"><CalendarDays className="h-3.5 w-3.5" />{dateLabel(report.date_from)} - {dateLabel(report.date_to)}</span>
          <span className="mt-3 flex items-center gap-2"><strong className="block text-base text-[var(--gbp-text)]">{report.title}</strong>{report.publication_status === "draft" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">Borrador</span>}</span>
          <span className="mt-1 block text-xs text-[var(--gbp-muted)]">{report.item_count} entregas · {report.publication_status === "published" ? "publicado" : "privado"}</span>
          <div className="mt-auto flex gap-2 pt-5">
            <Link href={`/superadmin/development-log/${report.id}`} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]">Abrir <Eye className="h-4 w-4" /></Link>
            {isPublisher && report.publication_status === "draft" && <PublishReportButton reportId={report.id} />}
          </div>
        </article>;
      })}
    </section> : <section className="grid min-h-96 place-items-center rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-8 text-center">
      <div><FileArchive className="mx-auto h-10 w-10 text-[var(--gbp-muted)]" /><h2 className="mt-4 font-black text-[var(--gbp-text)]">No hay períodos publicados</h2><p className="mt-1 text-sm text-[var(--gbp-muted)]">Los informes publicados aparecerán aquí.</p></div>
    </section>}
  </PageContent>;
}
