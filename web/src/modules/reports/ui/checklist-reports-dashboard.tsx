"use client";

import { FileBarChart, Search, X } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";

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
  commentsCount: number;
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
      note?: string;
      photosCount: number;
      photos?: string[];
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
  organizationId: string;
  generatedAt: string;
  statCards: ReportStatCard[];
  locationCards: LocationCard[];
  reports: ChecklistReportView[];
  attentionFeed: AttentionFeedItem[];
  deferredDataUrl?: string;
};

const REPORTS_POLL_MS = 3000;

function toneClasses(tone: ReportStatCard["tone"]) {
  if (tone === "success") return "text-[var(--gbp-success)]";
  if (tone === "warning") return "text-[var(--gbp-accent)]";
  if (tone === "muted") return "text-[var(--gbp-muted)]";
  return "text-[var(--gbp-text)]";
}

export function ChecklistReportsDashboard({
  organizationId,
  generatedAt,
  statCards,
  locationCards,
  reports,
  attentionFeed,
  deferredDataUrl,
}: ChecklistReportsDashboardProps) {
  const router = useRouter();
  const [generatedLabel, setGeneratedLabel] = useState(generatedAt);
  const [statCardsState, setStatCardsState] = useState(statCards);
  const [locationCardsState, setLocationCardsState] = useState(locationCards);
  const [reportsState, setReportsState] = useState(reports);
  const [attentionFeedState, setAttentionFeedState] = useState(attentionFeed);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!deferredDataUrl) return;
    const controller = new AbortController();
    void fetch(deferredDataUrl, { method: "GET", cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (typeof data?.generatedAt === "string") setGeneratedLabel(data.generatedAt);
        if (Array.isArray(data?.statCards)) setStatCardsState(data.statCards as ReportStatCard[]);
        if (Array.isArray(data?.locationCards)) setLocationCardsState(data.locationCards as LocationCard[]);
        if (Array.isArray(data?.reports)) setReportsState(data.reports as ChecklistReportView[]);
        if (Array.isArray(data?.attentionFeed)) setAttentionFeedState(data.attentionFeed as AttentionFeedItem[]);
      })
      .catch(() => {
        // keep current snapshot
      });

    return () => controller.abort();
  }, [deferredDataUrl, refreshKey]);

  const effectiveGeneratedAt = deferredDataUrl ? generatedLabel : generatedAt;
  const effectiveStatCards = deferredDataUrl ? statCardsState : statCards;
  const effectiveLocationCards = deferredDataUrl ? locationCardsState : locationCards;
  const effectiveReports = deferredDataUrl ? reportsState : reports;
  const effectiveAttentionFeed = deferredDataUrl ? attentionFeedState : attentionFeed;
  const hasSingleLocationCard = effectiveLocationCards.length === 1;
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ok" | "warn">("");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");

  // Supabase Realtime: auto-refresh when reports-related data changes
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const orgFilter = `organization_id=eq.${organizationId}`;

    function scheduleRefresh() {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        router.refresh();
        setRefreshKey((prev) => prev + 1);
      }, 300);
    }

    const channel = supabase
      .channel(`checklist-reports-realtime-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_submissions",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_submission_items",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_flags",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_item_comments",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "checklist_item_attachments",
          filter: orgFilter,
        },
        scheduleRefresh,
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  useEffect(() => {
    function triggerClientRefresh() {
      setRefreshKey((prev) => prev + 1);
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        triggerClientRefresh();
      }
    }

    const pollTimer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      triggerClientRefresh();
    }, REPORTS_POLL_MS);

    window.addEventListener("focus", triggerClientRefresh);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(pollTimer);
      window.removeEventListener("focus", triggerClientRefresh);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const selectedReport = useMemo(
    () => effectiveReports.find((report) => report.id === selectedReportId) ?? null,
    [effectiveReports, selectedReportId],
  );

  const locationCardsGridClass = hasSingleLocationCard
    ? "grid gap-3 grid-cols-1"
    : "grid gap-3 md:grid-cols-2";

  const locations = useMemo(
    () => [...new Set(effectiveReports.map((report) => report.locationName))].sort((a, b) => a.localeCompare(b, "es")),
    [effectiveReports],
  );
  const showAttentionLocationBadge = locations.length >= 2;

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return effectiveReports.filter((report) => {
      if (locationFilter && report.locationName !== locationFilter) return false;
      if (statusFilter && report.status !== statusFilter) return false;
      if (!q) return true;
      return (
        report.managerName.toLowerCase().includes(q) ||
        report.locationName.toLowerCase().includes(q) ||
        report.templateName.toLowerCase().includes(q)
      );
    });
  }, [effectiveReports, query, locationFilter, statusFilter]);

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
      <section className="mb-6 rounded-2xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[var(--gbp-muted)]">Reportes de apertura</p>
          <h1 className="mt-1 font-serif text-[31px] leading-none text-[var(--gbp-text)]">Dashboard de Reportes</h1>
          <p className="mt-1 text-xs text-[var(--gbp-text2)]">{effectiveGeneratedAt}</p>
        </div>
      </section>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {effectiveStatCards.map((card) => (
          <article key={card.label} className="rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4 transition hover:shadow-[var(--gbp-shadow-md)]">
            <p className="text-xl leading-none">{card.icon}</p>
            <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">{card.label}</p>
            <p className={`mt-1 font-serif text-[30px] leading-none ${toneClasses(card.tone)}`}>{card.value}</p>
            <p className="mt-1 text-xs text-[var(--gbp-muted)]">{card.subLabel}</p>
          </article>
        ))}
      </section>

      <section className="mb-7">
        <h2 className="mb-3 font-serif text-[22px] text-[var(--gbp-text)]">Estado por Ubicación - Hoy</h2>
        <div className={locationCardsGridClass}>
          {effectiveLocationCards.map((card) => (
            <button
              key={card.branchId}
              type="button"
              onClick={() => card.reportId && setSelectedReportId(card.reportId)}
              disabled={!card.reportId}
               className={`relative w-full overflow-hidden rounded-[14px] border-[1.5px] bg-[var(--gbp-surface)] px-5 py-4 text-left transition ${
                card.reportId
                  ? "border-[var(--gbp-border)] hover:-translate-y-[1px] hover:border-[var(--gbp-border2)] hover:shadow-[var(--gbp-shadow-md)]"
                  : "cursor-default border-[var(--gbp-border2)]"
               }`}
            >
              <span
                className={`absolute inset-y-0 left-0 w-1 ${
                  card.status === "ok" ? "bg-[var(--gbp-success)]" : card.status === "warn" ? "bg-[var(--gbp-accent)]" : "bg-[var(--gbp-border)]"
                }`}
              />

              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-bold text-[var(--gbp-text)]">{card.branchName}</p>
                  <p className="text-xs text-[var(--gbp-text2)]">{card.cityLabel || "Sin ciudad"}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
                    card.status === "ok"
                      ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                      : card.status === "warn"
                        ? "bg-[color-mix(in_oklab,var(--gbp-accent)_22%,transparent)] text-[var(--gbp-accent)]"
                        : "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"
                  }`}
                >
                  {card.badge}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs text-[var(--gbp-text2)]">
                <div><strong className="block text-sm text-[var(--gbp-text)]">{card.metrics.total || "-"}</strong>Items</div>
                <div><strong className="block text-sm text-[var(--gbp-text)]">{card.metrics.done || "-"}</strong>Completados</div>
                <div><strong className="block text-sm text-[var(--gbp-accent)]">{card.metrics.attention || "-"}</strong>Atencion</div>
                <div><strong className="block text-sm text-[var(--gbp-text)]">{card.metrics.photos || "-"}</strong>Fotos</div>
              </div>

              <div className="mt-3 flex items-center gap-2 border-t border-[var(--gbp-border)] pt-3">
                <div className="grid h-7 w-7 place-items-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: card.managerColor }}>
                  {card.managerInitials}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[var(--gbp-text)]">{card.managerName}</p>
                  <p className={`text-[11px] ${card.status === "none" ? "font-semibold text-[var(--gbp-error)]" : "text-[var(--gbp-text2)]"}`}>{card.sentAtLabel}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <h2 className="mb-3 font-serif text-[22px] text-[var(--gbp-text)]">Historial de Reportes</h2>
          <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--gbp-border)] px-4 py-3">
              <p className="mr-auto text-[15px] font-bold text-[var(--gbp-text)]">Todos los reportes</p>
              <label className="inline-flex w-full items-center gap-2 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 sm:w-auto">
                <Search className="h-4 w-4 text-[var(--gbp-muted)]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar..."
                  className="h-9 w-full min-w-0 bg-transparent text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:outline-none sm:w-[170px]"
                />
              </label>
              <select
                value={locationFilter}
                onChange={(event) => setLocationFilter(event.target.value)}
                className="h-9 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm text-[var(--gbp-text2)]"
              >
                <option value="">Todas las ubicaciones</option>
                {locations.map((location) => (
                  <option key={location} value={location}>{location}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "" | "ok" | "warn")}
                className="h-9 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm text-[var(--gbp-text2)]"
              >
                <option value="">Todos</option>
                <option value="ok">Sin novedades</option>
                <option value="warn">Con atención</option>
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-left text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">
                    <th className="px-4 py-3">Nombre / Ubicación</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Progreso</th>
                    <th className="px-4 py-3">Observaciones</th>
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
                        className="cursor-pointer border-b border-[var(--gbp-border)] transition hover:bg-[var(--gbp-bg)]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: report.managerColor }}>
                              {report.managerInitials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-[var(--gbp-text)]">{report.managerName}</p>
                              <div className="mt-1">
                                <span className="inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-accent)]">
                                  {report.locationName}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-[var(--gbp-text2)]">{report.dateLabel} · {report.timeLabel}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--gbp-border)]">
                              <div className={`h-full rounded-full ${report.flaggedItems > 0 ? "bg-[var(--gbp-accent)]" : "bg-[var(--gbp-success)]"}`} style={{ width: `${percent}%` }} />
                            </div>
                            <span className="text-xs text-[var(--gbp-text2)]">{report.completedItems}/{report.totalItems}</span>
                          </div>
                        </td>
                        <td className="w-24 whitespace-nowrap p-4 text-sm font-semibold text-[var(--gbp-text)]">
                          <div className="flex flex-wrap items-center gap-2">
                            {report.flaggedItems === 0 ? (
                              <span className="flex items-center gap-1 text-[11px] font-bold text-[var(--gbp-success)]">✓ OK</span>
                            ) : (
                              <span className="inline-flex h-5 items-center gap-1 rounded bg-[var(--gbp-error-soft)] px-1.5 text-[10px] font-extrabold text-[var(--gbp-error)]">
                                <span className="text-[var(--gbp-error)]">⚑</span> {report.flaggedItems}
                              </span>
                            )}
                            
                            {report.commentsCount > 0 && (
                              <span className="inline-flex h-5 items-center gap-1 rounded bg-[var(--gbp-bg)] px-1.5 text-[10px] font-extrabold text-[var(--gbp-text2)]">
                                <span className="opacity-80">💬</span> {report.commentsCount}
                              </span>
                            )}

                            {report.photosCount > 0 && (
                              <span className="inline-flex h-5 items-center gap-1 rounded bg-[var(--gbp-bg)] px-1.5 text-[10px] font-extrabold text-[var(--gbp-text2)]">
                                <span className="opacity-80">📷</span> {report.photosCount}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${report.dbStatus === "reviewed" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]"}`}>
                            {report.dbStatus === "reviewed" ? "Revisado" : "Pendiente"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${report.status === "ok" ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]" : "bg-[color-mix(in_oklab,var(--gbp-accent)_22%,transparent)] text-[var(--gbp-accent)]"}`}>
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

        <aside className="min-w-0">
          <h2 className="mb-3 font-serif text-[22px] text-[var(--gbp-text)]">⚑ Ítems para Atención</h2>
          <div className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
            {effectiveAttentionFeed.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedReportId(item.reportId)}
                className="flex w-full max-w-full items-start gap-3 overflow-hidden border-b border-[var(--gbp-border)] px-4 py-3 text-left transition hover:bg-[var(--gbp-bg)]"
              >
                <span className={`mt-1 h-2.5 w-2.5 rounded-full ${item.resolved ? "bg-[var(--gbp-success)]" : "bg-[var(--gbp-accent)]"}`} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-[13px] font-semibold text-[var(--gbp-text)]">{item.task}</p>
                  <p className="truncate text-xs text-[var(--gbp-text2)]">&quot;{item.note || "Sin comentario"}&quot;</p>
                  <p className="mt-1 truncate text-[11px] text-[var(--gbp-muted)]">{item.managerShort} · {item.timeLabel}</p>
                </div>
                {showAttentionLocationBadge ? (
                  <span className="inline-flex max-w-[48%] shrink-0 items-center truncate rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[11px] font-medium text-[var(--gbp-accent)]">{item.locationShort}</span>
                ) : null}
              </button>
            ))}
            {!effectiveAttentionFeed.length ? (
              <EmptyState title="Sin incidencias" description="No hay incidencias abiertas en este momento." />
            ) : null}
          </div>
        </aside>
      </section>

      {selectedReport ? (
        <>
          <button type="button" onClick={() => setSelectedReportId(null)} className="fixed inset-0 z-[150] bg-black/40" />

          <aside className="fixed inset-y-0 right-0 z-[151] flex w-full max-w-[560px] flex-col bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-lg)]">
            <header className="flex items-start justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
              <div>
                <h3 className="font-serif text-[25px] text-[var(--gbp-text)]">{selectedReport.locationName}</h3>
                <p className="text-xs text-[var(--gbp-text2)]">{selectedReport.managerName} · {selectedReport.dateLabel} {selectedReport.timeLabel} · {selectedReport.cityLabel || "Sin ciudad"}</p>
              </div>
              <button type="button" onClick={() => setSelectedReportId(null)} className="grid h-8 w-8 place-items-center rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)] transition hover:border-[var(--gbp-accent)] hover:bg-[var(--gbp-accent)] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="mb-5 grid grid-cols-3 gap-2">
                <div className="rounded-[10px] bg-[var(--gbp-bg)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Completados</p>
                  <p className="text-[17px] font-bold text-[var(--gbp-success)]">{selectedReport.completedItems}/{selectedReport.totalItems}</p>
                </div>
                <div className="rounded-[10px] bg-[var(--gbp-bg)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Para Atención</p>
                  <p className="text-[17px] font-bold text-[var(--gbp-accent)]">{selectedReport.flaggedItems}</p>
                </div>
                <div className="rounded-[10px] bg-[var(--gbp-bg)] px-3 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Fotos</p>
                  <p className="text-[17px] font-bold text-[var(--gbp-text)]">{selectedReport.photosCount}</p>
                </div>
              </div>

              {selectedReport.attentionItems.length > 0 ? (
                <div className="mb-5 rounded-xl border-[1.5px] border-[color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-[var(--gbp-accent)]">⚑ Requieren Atención</p>
                  <div className="space-y-2">
                    {selectedReport.attentionItems.map((item) => (
                      <div key={item.id} className="flex gap-2 border-b border-black/5 pb-2 text-sm last:border-b-0 last:pb-0">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[var(--gbp-accent)]">{item.task}</p>
                          <p className="text-xs italic text-[var(--gbp-accent)]">{item.note || "Sin comentario"}</p>
                        </div>
                        <span className="self-start rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold uppercase text-[var(--gbp-accent)]">{item.category}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedReport.categories.map((category) => (
                <section key={category.id} className="mb-5">
                  <p className="mb-2 border-b border-[var(--gbp-border)] pb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--gbp-text2)]">{category.name}</p>
                  <div className="space-y-1.5">
                    {category.items.map((item) => (
                      <article
                        key={item.id}
                        className={`rounded-[10px] px-3 py-2 text-sm ${
                          item.flag
                            ? "border border-[color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[color-mix(in_oklab,var(--gbp-accent)_12%,transparent)] text-[var(--gbp-accent)]"
                            : item.ok
                              ? "bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]"
                              : "bg-[var(--gbp-bg)] text-[var(--gbp-text2)]"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span>{item.flag ? "⚑" : item.ok ? "✓" : "○"}</span>
                          <div className="min-w-0 flex-1">
                            <p>{item.text}</p>
                            {item.note ? <p className="mt-1 text-xs italic opacity-85">&quot;{item.note}&quot;</p> : null}
                            {item.photos?.length ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {item.photos.map((url, i) => (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="relative h-14 w-14 overflow-hidden rounded-md border border-black/10 transition hover:opacity-80"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={url} alt="Evidencia" className="h-full w-full object-cover" />
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <footer className="flex gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
              <button type="button" onClick={() => setSelectedReportId(null)} className="flex-1 rounded-lg border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2.5 text-sm font-semibold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)]">
                Cerrar
              </button>
              <button
                type="button"
                onClick={markSelectedReportAsReviewed}
                disabled={selectedReport.dbStatus === "reviewed" || isReviewing}
                className="flex-[1.5] rounded-lg bg-[var(--gbp-text)] px-3 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--gbp-accent)] disabled:cursor-not-allowed disabled:bg-[var(--gbp-muted)]"
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
