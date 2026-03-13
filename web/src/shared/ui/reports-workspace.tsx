"use client";

import { AlertTriangle, BarChart3, ChevronDown, Download, TimerReset } from "lucide-react";

type ReportCard = {
  id: number;
  branch: string;
  manager: string;
  completion: number;
  flags: number;
  submittedAt: string;
  status: "Completo" | "Pendiente" | "Con incidencias";
};

const REPORTS: ReportCard[] = [
  {
    id: 1,
    branch: "Long Beach",
    manager: "Carlos Martinez",
    completion: 98,
    flags: 1,
    submittedAt: "Hoy 08:05",
    status: "Con incidencias",
  },
  {
    id: 2,
    branch: "Biloxi",
    manager: "Laura Reyes",
    completion: 100,
    flags: 0,
    submittedAt: "Hoy 08:09",
    status: "Completo",
  },
  {
    id: 3,
    branch: "Waveland",
    manager: "Ana Garcia",
    completion: 74,
    flags: 3,
    submittedAt: "Pendiente",
    status: "Pendiente",
  },
];

function statusClass(status: ReportCard["status"]) {
  if (status === "Completo") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "Con incidencias") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

export function ReportsWorkspace() {
  const total = REPORTS.length;
  const complete = REPORTS.filter((r) => r.status === "Completo").length;
  const pending = REPORTS.filter((r) => r.status === "Pendiente").length;
  const withFlags = REPORTS.reduce((sum, r) => sum + r.flags, 0);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9d948f] uppercase">Supervision operativa</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Reportes</h1>
            <p className="mt-1 text-sm text-[#67605b]">Seguimiento diario de checklists por sucursal y estado de incidencias.</p>
          </div>
        </div>
      </section>

      <details className="group mb-5 rounded-2xl border border-[#e7e0dc] bg-white p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-[#e5ddd8] bg-[#fffdfa] px-4 py-3 hover:bg-[#faf6f4]">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#2b2521]"><BarChart3 className="h-4 w-4 text-[#b63a2f]" /> Acciones de reporte</div>
          <ChevronDown className="h-5 w-5 text-[#8b827d] transition group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <button className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-sm text-[#514b47] hover:bg-[#f7f3f1]"><Download className="h-4 w-4" /> Exportar reporte</button>
          <button className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-sm text-[#514b47] hover:bg-[#f7f3f1]"><TimerReset className="h-4 w-4" /> Refrescar datos</button>
          <button className="inline-flex items-center justify-center gap-1 rounded-lg border border-[#f2cdc6] bg-[#fff1ef] px-3 py-2 text-sm text-[#b63a2f] hover:bg-[#ffe8e4]"><AlertTriangle className="h-4 w-4" /> Ver incidencias</button>
        </div>
      </details>

      <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Reportes hoy</p>
          <p className="mt-1 text-2xl font-bold">{total}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Completos</p>
          <p className="mt-1 text-2xl font-bold">{complete}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Pendientes</p>
          <p className="mt-1 text-2xl font-bold">{pending}</p>
        </article>
        <article className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <p className="text-xs text-[#8a817b]">Incidencias</p>
          <p className="mt-1 text-2xl font-bold">{withFlags}</p>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          {REPORTS.map((report) => (
            <details key={report.id} className="group rounded-xl border border-[#e7e0dc] bg-white p-4" open>
              <summary className="mb-3 flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-[#26221f]">{report.branch}</h2>
                  <p className="text-xs text-[#8b817c]">Manager: {report.manager}</p>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(report.status)}`}>{report.status}</span>
                  <ChevronDown className="h-4 w-4 text-[#8b827d] transition group-open:rotate-180" />
                </div>
              </div>
              </summary>

              <div className="mb-2 h-2 rounded-full bg-[#f1ece8]">
                <div className="h-2 rounded-full bg-[#b63a2f]" style={{ width: `${report.completion}%` }} />
              </div>
              <div className="flex flex-wrap items-center justify-between text-sm text-[#5f5853]">
                <p>Completado: {report.completion}%</p>
                <p>Incidencias: {report.flags}</p>
                <p>{report.submittedAt}</p>
              </div>
            </details>
          ))}
        </div>

        <aside className="rounded-xl border border-[#e7e0dc] bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#8b817c]">Incidencias recientes</h3>
          <div className="space-y-3">
            <div className="rounded-lg border border-[#f0e3b8] bg-[#fff9e8] p-3 text-sm text-[#6a560a]">
              Falta evidencia fotografica en checklist de Long Beach.
            </div>
            <div className="rounded-lg border border-[#f5d2cc] bg-[#fff3f1] p-3 text-sm text-[#8f2f25]">
              Temperatura de refrigeracion fuera de rango (Waveland).
            </div>
            <div className="rounded-lg border border-[#dae6f6] bg-[#f2f7ff] p-3 text-sm text-[#2f4f7b]">
              Biloxi reporto cierre completo sin observaciones.
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
