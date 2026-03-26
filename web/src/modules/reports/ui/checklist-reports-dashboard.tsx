"use client";

import { FileBarChart, Search, X } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export type ChecklistReportView = {
  id: string;
  branchId: string | null;
  locationName: string;
  locationShort: string;
  cityLabel: string;
  managerName: string;
  managerShort: string;
  managerInitials: string;
  managerColor: string;
  dateLabel: string;
  timeLabel: string;
  submittedAtIso: string | null;
  templateName: string;
  totalItems: number;
  completedItems: number;
  flaggedItems: number;
  photosCount: number;
  status: "ok" | "warn";
  dbStatus: string;
  categories: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      text: string;
      ok: boolean;
      flag: boolean;
      note: string;
      photosCount: number;
      itemOrder: number;
    }>;
  }>;
  attentionItems: Array<{
    id: string;
    task: string;
    note: string;
    category: string;
  }>;
};

type ReportStatCard = {
  label: string;
  value: string;
  subLabel: string;
  icon: string;
  tone: "default" | "success" | "warning" | "muted";
};

type LocationCard = {
  branchId: string;
  branchName: string;
  cityLabel: string;
  status: "ok" | "warn" | "none";
  badge: string;
  managerName: string;
  managerInitials: string;
  managerColor: string;
  sentAtLabel: string;
  metrics: {
    total: number;
    done: number;
    attention: number;
    photos: number;
  };
  reportId: string | null;
};

type AttentionFeedItem = {
  id: string;
  reportId: string;
  task: string;
  note: string;
  managerShort: string;
  timeLabel: string;
  locationShort: string;
  resolved: boolean;
};

type ChecklistReportsDashboardProps = {
  generatedAt: string;
  statCards: ReportStatCard[];
  locationCards: LocationCard[];
  reports: ChecklistReportView[];
  attentionFeed: AttentionFeedItem[];
};

function toneClasses(tone: ReportStatCard["tone"]) {
  if (tone === "success") return "text-[#15803d]";
  if (tone === "warning") return "text-[#b45309]";
  if (tone === "muted") return "text-[#9ca3af]";
  return "text-[#0e0e0e]";
}

export function ChecklistReportsDashboard({
  generatedAt,
  statCards,
  locationCards,
  reports,
  attentionFeed,
}: ChecklistReportsDashboardProps) {
  const router = useRouter();
  const hasSingleLocationCard = locationCards.length === 1;
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ok" | "warn">("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  const locationCardsGridClass = hasSingleLocationCard
    ? "grid gap-3 grid-cols-1"
    : "grid gap-3 md:grid-cols-2";

  const locations = useMemo(
    () => [...new Set(reports.map((report) => report.locationName))].sort((a, b) => a.localeCompare(b, "es")),
    [reports],
  );
  const showAttentionLocationBadge = locations.length >= 2;

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((report) => {
      if (locationFilter && report.locationName !== locationFilter) return false;
      if (statusFilter && report.status !== statusFilter) return false;
      if (!q) return true;
      return (
        report.managerName.toLowerCase().includes(q) ||
        report.locationName.toLowerCase().includes(q) ||
        report.templateName.toLowerCase().includes(q)
      );
    });
  }, [reports, query, locationFilter, statusFilter]);

  async function markSelectedReportAsReviewed() {
    if (!selectedReport || selectedReport.dbStatus === "reviewed" || isReviewing) {
      return;
    }

    setReviewError("");
    setIsReviewing(true);

    const response = await fetch("/api/company/checklists/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ submissionId: selectedReport.id }),
    });

    const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    setIsReviewing(false);

    if (!response.ok || !payload?.ok) {
      setReviewError(payload?.error ?? "No se pudo marcar como revisado");
      return;
    }

    setSelectedReportId(null);
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 py-7 sm:px-6 lg:px-8">
      <section className="mb-6 rounded-2xl border-[1.5px] border-[#e7e0dc] bg-white px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#908782]">Reportes de apertura</p>
          <h1 className="mt-1 font-serif text-[31px] leading-none text-[#0e0e0e]">Dashboard de Reportes</h1>
          <p className="mt-1 text-xs text-[#888]">{generatedAt}</p>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <article key={card.label} className="rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white px-5 py-4 transition hover:shadow-[0_6px_20px_rgba(0,0,0,.07)]">
            <p className="text-xl leading-none">{card.icon}</p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">{card.label}</p>
            <p className={`mt-1 font-serif text-[30px] leading-none ${toneClasses(card.tone)}`}>{card.value}</p>
            <p className="mt-1 text-xs text-[#bbb]">{card.subLabel}</p>
          </article>
        ))}
      </section>

      <section className="mb-7">
        <h2 className="mb-3 font-serif text-[22px] text-[#0e0e0e]">Estado por Ubicación - Hoy</h2>
        <div className={locationCardsGridClass}>
          {locationCards.map((card) => (
            <button
              key={card.branchId}
              type="button"
              onClick={() => card.reportId && setSelectedReportId(card.reportId)}
              disabled={!card.reportId}
              className={`relative w-full overflow-hidden rounded-[14px] border-[1.5px] bg-white px-5 py-4 text-left transition ${
                card.reportId
                  ? "border-[#e8e8e8] hover:-translate-y-[1px] hover:border-[#ddd] hover:shadow-[0_8px_24px_rgba(0,0,0,.08)]"
                  : "cursor-default border-[#ececec]"
              }`}
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${
                  card.status === "ok" ? "bg-[#22c55e]" : card.status === "warn" ? "bg-[#f59e0b]" : "bg-[#e5e7eb]"
                }`}
              />

              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-bold text-[#0e0e0e]">{card.branchName}</p>
                  <p className="text-xs text-[#888]">{card.cityLabel || "Sin ciudad"}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    card.status === "ok"
                      ? "bg-[#dcfce7] text-[#15803d]"
                      : card.status === "warn"
                        ? "bg-[#fef3c7] text-[#92400e]"
                        : "bg-[#fee2e2] text-[#991b1b]"
                  }`}
                >
                  {card.badge}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs text-[#888]">
                <div><strong className="block text-sm text-[#0e0e0e]">{card.metrics.total || "-"}</strong>Items</div>
                <div><strong className="block text-sm text-[#0e0e0e]">{card.metrics.done || "-"}</strong>Completados</div>
                <div><strong className="block text-sm text-[#b45309]">{card.metrics.attention || "-"}</strong>Atencion</div>
                <div><strong className="block text-sm text-[#0e0e0e]">{card.metrics.photos || "-"}</strong>Fotos</div>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-[#f5f5f5] pt-3">
                <div className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: card.managerColor }}>
                  {card.managerInitials}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#0e0e0e]">{card.managerName}</p>
                  <p className={`text-[11px] ${card.status === "none" ? "font-semibold text-[#b91c1c]" : "text-[#888]"}`}>{card.sentAtLabel}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <div>
          <h2 className="mb-3 font-serif text-[22px] text-[#0e0e0e]">Historial de Reportes</h2>
          <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-4 py-3">
              <p className="mr-auto text-[15px] font-bold text-[#0e0e0e]">Todos los reportes</p>
              <label className="inline-flex items-center gap-2 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3">
                <Search className="h-4 w-4 text-[#bbb]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar..."
                  className="h-9 w-[170px] bg-transparent text-sm text-[#0e0e0e] placeholder:text-[#bbb] focus:outline-none"
                />
              </label>
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className="h-9 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 text-sm text-[#555]"
              >
                <option value="">Todas las ubicaciones</option>
                {locations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "" | "ok" | "warn")}
                className="h-9 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 text-sm text-[#555]"
              >
                <option value="">Todos</option>
                <option value="ok">Sin novedades</option>
                <option value="warn">Con atención</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse">
                <thead>
                  <tr className="border-b border-[#f0f0f0] bg-[#fafafa] text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">
                    <th className="px-4 py-3">Nombre / Ubicación</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Progreso</th>
                    <th className="px-4 py-3">Atención</th>
                    <th className="px-4 py-3">Revisión</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((report) => {
                    const percent = report.totalItems ? Math.round((report.completedItems / report.totalItems) * 100) : 0;
                    return (
                      <tr
                        key={report.id}
                        onClick={() => setSelectedReportId(report.id)}
                        className="cursor-pointer border-b border-[#f8f8f8] transition hover:bg-[#fafafa]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: report.managerColor }}>
                              {report.managerInitials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[#0e0e0e]">{report.managerName}</p>
                              <p className="text-xs text-[#888]">{report.locationName}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[#888]">{report.dateLabel} · {report.timeLabel}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#f0f0f0]">
                              <div className={`h-full rounded-full ${report.flaggedItems > 0 ? "bg-[#f59e0b]" : "bg-[#22c55e]"}`} style={{ width: `${percent}%` }} />
                            </div>
                            <span className="text-xs text-[#888]">{report.completedItems}/{report.totalItems}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {report.flaggedItems > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#fef3c7] px-2.5 py-1 text-[11px] font-bold text-[#92400e]">⚑ {report.flaggedItems}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-1 text-[11px] font-bold text-[#15803d]">✓ OK</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${report.dbStatus === "reviewed" ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#fee2e2] text-[#b91c1c]"}`}>
                            {report.dbStatus === "reviewed" ? "Revisado" : "Pendiente"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${report.status === "ok" ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fef3c7] text-[#92400e]"}`}>
                            {report.status === "ok" ? "✓ Completo" : "⚑ Atención"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!filteredReports.length ? (
              <EmptyState icon={FileBarChart} title="No hay reportes" description="No se encontraron reportes para los filtros aplicados." />
            ) : null}
          </div>
        </div>

        <aside>
          <h2 className="mb-3 font-serif text-[22px] text-[#0e0e0e]">⚑ Ítems para Atención</h2>
          <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white">
            {attentionFeed.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedReportId(item.reportId)}
                className="flex w-full items-start gap-3 border-b border-[#f8f8f8] px-4 py-3 text-left transition hover:bg-[#fafafa]"
              >
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.resolved ? "bg-[#22c55e]" : "bg-[#f59e0b]"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-[#0e0e0e]">{item.task}</p>
                  <p className="truncate text-xs text-[#888]">&quot;{item.note || "Sin comentario"}&quot;</p>
                  <p className="mt-1 text-[11px] text-[#bbb]">{item.managerShort} · {item.timeLabel}</p>
                </div>
                {showAttentionLocationBadge ? (
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#555]">{item.locationShort}</span>
                ) : null}
              </button>
            ))}
            {!attentionFeed.length ? (
              <EmptyState title="Sin incidencias" description="No hay incidencias abiertas en este momento." />
            ) : null}
          </div>
        </aside>
      </section>

      {selectedReport ? (
        <>
          <button type="button" onClick={() => setSelectedReportId(null)} className="fixed inset-0 z-[150] bg-black/40" />

          <aside className="fixed inset-y-0 right-0 z-[151] flex w-full max-w-[560px] flex-col bg-white shadow-[-8px_0_40px_rgba(0,0,0,.15)]">
            <header className="flex items-start justify-between border-b-[1.5px] border-[#e8e8e8] px-6 py-5">
              <div>
                <h3 className="font-serif text-[25px] text-[#0e0e0e]">{selectedReport.locationName}</h3>
                <p className="text-xs text-[#888]">{selectedReport.managerName} · {selectedReport.dateLabel} {selectedReport.timeLabel} · {selectedReport.cityLabel || "Sin ciudad"}</p>
              </div>
              <button type="button" onClick={() => setSelectedReportId(null)} className="grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] text-[#888] transition hover:border-[#c0392b] hover:bg-[#c0392b] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] bg-[#f8f8f8] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">Completados</p>
                  <p className="text-[17px] font-bold text-[#15803d]">{selectedReport.completedItems}/{selectedReport.totalItems}</p>
                </div>
                <div className="rounded-[10px] bg-[#f8f8f8] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">Para Atención</p>
                  <p className="text-[17px] font-bold text-[#b45309]">{selectedReport.flaggedItems}</p>
                </div>
                <div className="rounded-[10px] bg-[#f8f8f8] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#888]">Fotos</p>
                  <p className="text-[17px] font-bold text-[#0e0e0e]">{selectedReport.photosCount}</p>
                </div>
              </div>

              {selectedReport.attentionItems.length > 0 ? (
                <div className="mb-5 rounded-xl border-[1.5px] border-[#fde68a] bg-[#fffbeb] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-[#92400e]">⚑ Requieren Atención</p>
                  <div className="space-y-2">
                    {selectedReport.attentionItems.map((item) => (
                      <div key={item.id} className="flex gap-2 border-b border-black/5 pb-2 text-sm last:border-b-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[#78350f]">{item.task}</p>
                          <p className="text-xs italic text-[#92400e]">{item.note || "Sin comentario"}</p>
                        </div>
                        <span className="self-start rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase text-[#78350f]">{item.category}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedReport.categories.map((category) => (
                <section key={category.id} className="mb-5">
                  <p className="mb-2 border-b border-[#f0f0f0] pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#888]">{category.name}</p>
                  <div className="space-y-1.5">
                    {category.items.map((item) => (
                      <article
                        key={item.id}
                        className={`rounded-[10px] px-3 py-2 text-sm ${
                          item.flag
                            ? "border border-[#fde68a] bg-[#fffbeb] text-[#92400e]"
                            : item.ok
                              ? "bg-[#f0fdf4] text-[#166534]"
                              : "bg-[#f9fafb] text-[#6b7280]"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span>{item.flag ? "⚑" : item.ok ? "✓" : "○"}</span>
                          <div className="min-w-0 flex-1">
                            <p>{item.text}</p>
                            {item.note ? <p className="mt-1 text-xs italic opacity-85">&quot;{item.note}&quot;</p> : null}
                            {item.photosCount > 0 ? <p className="mt-1 text-xs opacity-85">📷 {item.photosCount} evidencia(s)</p> : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <footer className="flex gap-2 border-t-[1.5px] border-[#e8e8e8] px-6 py-4">
              <button type="button" onClick={() => setSelectedReportId(null)} className="flex-1 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2.5 text-sm font-semibold text-[#555] transition hover:bg-[#ededed]">
                Cerrar
              </button>
              <button
                type="button"
                onClick={markSelectedReportAsReviewed}
                disabled={selectedReport.dbStatus === "reviewed" || isReviewing}
                className="flex-[1.5] rounded-lg bg-[#0e0e0e] px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[#c0392b] disabled:cursor-not-allowed disabled:bg-[#b9b3af]"
              >
                {selectedReport.dbStatus === "reviewed"
                  ? "✓ Reporte revisado"
                  : isReviewing
                    ? "Marcando revision..."
                    : "Marcar como revisado"}
              </button>
            </footer>
            {reviewError ? (
              <div className="border-t border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-700">{reviewError}</div>
            ) : null}
          </aside>
        </>
      ) : null}
    </main>
  );
}
