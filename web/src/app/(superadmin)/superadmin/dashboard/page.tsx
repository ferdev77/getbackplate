import {
  Activity,
  ArrowRight,
  AlertTriangle,
  BadgeCheck,
  Building2,
  CircleOff,
  FileText,
  Layers3,
  Timer,
  Megaphone,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import {
  getSuperadminHealthMetrics,
  getSuperadminObservabilityMetrics,
  type ObservabilityDomainStatus,
} from "@/modules/superadmin/lib/health-metrics";

function statusTone(status: string) {
  if (status === "active") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "paused") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function scoreTone(score: number) {
  if (score >= 85) return "text-emerald-700 bg-emerald-50 border-emerald-200";
  if (score >= 65) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-rose-700 bg-rose-50 border-rose-200";
}

function scoreBar(score: number) {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 65) return "bg-amber-500";
  return "bg-rose-500";
}

function formatStorage(mb: number) {
  if (mb <= 0) return "0 MB";
  if (mb < 0.1) return `${Math.round(mb * 1024)} KB`;
  if (mb >= 100) return `${Math.round(mb)} MB`;
  return `${mb.toFixed(1)} MB`;
}

function statusBadgeTone(status: ObservabilityDomainStatus) {
  if (status === "critical") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusBadgeText(status: ObservabilityDomainStatus) {
  if (status === "critical") return "Critico";
  if (status === "warning") return "Alerta";
  return "OK";
}

function formatDuration(ms: number | null) {
  if (ms == null) return "Sin datos";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default async function SuperadminDashboardPage() {
  const SHOW_OBSERVABILITY_CARD = false;

  const health = await getSuperadminHealthMetrics();
  const observability = SHOW_OBSERVABILITY_CARD
    ? await getSuperadminObservabilityMetrics(7)
    : null;

  const {
    orgCount,
    modulesCount,
    healthyOrgs,
    orgsWithRisk,
    topByRisk,
    docs30dTotal,
    storageMbTotal,
    checklist7dTotal,
    announcementsTotal,
  } = health;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
      <section className="relative overflow-hidden rounded-3xl border border-[#2b2521] bg-[#171311] p-7 text-white">
        <div className="pointer-events-none absolute -right-14 -top-16 h-[260px] w-[260px] rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.30)_0%,transparent_70%)]" />
        <div className="pointer-events-none absolute -left-24 bottom-[-120px] h-[280px] w-[280px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.07)_0%,transparent_70%)]" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#b8aaa2]">Control central</p>
            <h1 className="font-serif text-[34px] leading-tight">Panel Superadmin</h1>
            <p className="mt-2 text-sm leading-7 text-[#c6bbb3]">
              Visibilidad operativa real por tenant con foco en riesgo, actividad y cobertura administrativa.
            </p>
          </div>
          <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-right">
            <p className="text-[11px] uppercase tracking-[0.12em] text-[#b8aaa2]">Tenants sanos</p>
            <p className="font-serif text-4xl leading-none">{healthyOrgs}</p>
            <p className="text-xs text-[#b8aaa2]">de {orgCount} organizaciones</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[#e5ddd8] bg-white p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#8d847f]"><Building2 className="h-3.5 w-3.5" />Empresas</p>
          <p className="mt-2 font-serif text-3xl text-[#251f1b]">{orgCount}</p>
        </article>
        <article className="rounded-2xl border border-[#e5ddd8] bg-white p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#8d847f]"><Layers3 className="h-3.5 w-3.5" />Modulos</p>
          <p className="mt-2 font-serif text-3xl text-[#251f1b]">{modulesCount}</p>
        </article>
        <article className="rounded-2xl border border-[#d7eedf] bg-[#f4fbf6] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#5a7c65]"><ShieldCheck className="h-3.5 w-3.5" />Saludables</p>
          <p className="mt-2 font-serif text-3xl text-[#1f6b3a]">{healthyOrgs}</p>
        </article>
        <article className="rounded-2xl border border-[#f2d6d0] bg-[#fff7f5] p-4">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-[#9b564a]"><AlertTriangle className="h-3.5 w-3.5" />Riesgo alto</p>
          <p className="mt-2 font-serif text-3xl text-[#b63a2f]">{orgsWithRisk}</p>
        </article>
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[1.7fr_1fr]">
        <article className="overflow-hidden rounded-2xl border border-[#e5ddd8] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#efe6e1] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#2f2925]">Radar de organizaciones</h2>
              <p className="text-xs text-[#817873]">Top 10 con mayor riesgo operativo (score mas bajo primero).</p>
              <p className="text-[11px] text-[#9a908a]">Score operativo 0-100 (base 100, penaliza: tenant inactivo -20, sin admin -35, sin modulos -25, sin empleados -15, sin actividad -10).</p>
            </div>
            <Link href="/superadmin/organizations" className="inline-flex items-center gap-1 rounded-lg border border-[#e4d8d3] bg-[#faf6f4] px-3 py-1.5 text-xs font-semibold text-[#6c625c] hover:bg-[#f3ebe7]">
              Ver organizaciones <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[#f3ebe6]">
            {topByRisk.map((row) => (
              <div key={row.organizationId} className="px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#2f2925]">{row.name}</p>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusTone(row.status)}`}>{row.status}</span>
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${scoreTone(row.score)}`}>score {row.score}</span>
                  </div>
                </div>
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#f0e7e3]">
                  <div className={`h-full rounded-full ${scoreBar(row.score)}`} style={{ width: `${Math.max(8, row.score)}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-[#726963] sm:grid-cols-4">
                  <span>Admins: <strong className="text-[#3f3732]">{row.activeAdmins}</strong></span>
                  <span>Miembros: <strong className="text-[#3f3732]">{row.activeMembers}</strong></span>
                  <span>Empleados: <strong className="text-[#3f3732]">{row.activeEmployees}</strong></span>
                  <span>Modulos: <strong className="text-[#3f3732]">{row.enabledModules}</strong></span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-[#726963]">
                  <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {row.docs30d} docs/30d</span>
                  <span className="inline-flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> {row.checklist7d} checklist/7d</span>
                  <span className="inline-flex items-center gap-1"><Megaphone className="h-3.5 w-3.5" /> {row.activeAnnouncements} avisos</span>
                </div>
                <p className="mt-1 text-xs text-[#726963]">
                  Storage: <strong className="text-[#3f3732]">{formatStorage(row.storageMb)}</strong>
                  <span className="text-[#8a807b]"> / {row.storageLimitMb != null ? formatStorage(row.storageLimitMb) : "Sin limite"}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {row.issues.length ? row.issues.map((issue) => (
                    <span key={`${row.organizationId}-${issue}`} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700">{issue}</span>
                  )) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"><BadgeCheck className="h-3.5 w-3.5" />estable</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </article>

        <div className="space-y-4">
          <article className="rounded-2xl border border-[#e5ddd8] bg-white p-5">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[#2f2925]"><Activity className="h-4 w-4" />Actividad plataforma</p>
            <div className="mt-3 space-y-3 text-sm text-[#6b635e]">
              <div className="flex items-center justify-between rounded-lg bg-[#faf6f4] px-3 py-2"><span>Documentos (30d)</span><strong className="text-[#2f2925]">{docs30dTotal}</strong></div>
              <div className="flex items-center justify-between rounded-lg bg-[#faf6f4] px-3 py-2"><span>Storage usado</span><strong className="text-[#2f2925]">{formatStorage(storageMbTotal)}</strong></div>
              <div className="flex items-center justify-between rounded-lg bg-[#faf6f4] px-3 py-2"><span>Checklists (7d)</span><strong className="text-[#2f2925]">{checklist7dTotal}</strong></div>
              <div className="flex items-center justify-between rounded-lg bg-[#faf6f4] px-3 py-2"><span>Avisos activos</span><strong className="text-[#2f2925]">{announcementsTotal}</strong></div>
            </div>
          </article>

          {SHOW_OBSERVABILITY_CARD && observability ? (
            <article className="rounded-2xl border border-[#e5ddd8] bg-white p-5">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-[#2f2925]"><Timer className="h-4 w-4" />Observabilidad (7 dias)</p>
              <p className="text-xs text-[#817873]">Vista rapida de errores, bloqueos y salud por areas criticas.</p>

              <div className="mt-3 space-y-3 text-sm text-[#6b635e]">
                <div className="flex items-center justify-between rounded-lg bg-[#faf6f4] px-3 py-2"><span>Eventos totales</span><strong className="text-[#2f2925]">{observability.totalEvents}</strong></div>
                <div className="flex items-center justify-between rounded-lg bg-[#fff7f5] px-3 py-2"><span>Errores</span><strong className="text-[#b63a2f]">{observability.errorEvents}</strong></div>
                <div className="flex items-center justify-between rounded-lg bg-[#fffbf2] px-3 py-2"><span>Accesos bloqueados</span><strong className="text-[#9b564a]">{observability.deniedEvents}</strong></div>
                <div className="flex items-center justify-between rounded-lg bg-[#faf6f4] px-3 py-2"><span>Fallos de login</span><strong className="text-[#2f2925]">{observability.failedAuthEvents}</strong></div>
                <div className="flex items-center justify-between rounded-lg bg-[#f4fbf6] px-3 py-2"><span>Respuesta promedio</span><strong className="text-[#1f6b3a]">{formatDuration(observability.avgResponseMs)}</strong></div>
                <div className="flex items-center justify-between rounded-lg bg-[#f4fbf6] px-3 py-2"><span>Respuesta lenta (p95)</span><strong className="text-[#1f6b3a]">{formatDuration(observability.p95ResponseMs)}</strong></div>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8d847f]">Areas con mas fallos</p>
                {observability.criticalDomains.length > 0 ? (
                  observability.criticalDomains.map((domain) => (
                    <div key={domain.domain} className="rounded-lg border border-[#efe6e1] bg-[#fdfbfa] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[#2f2925]">{domain.label}</p>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusBadgeTone(domain.status)}`}>
                          {statusBadgeText(domain.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[#726963]">{domain.incidentEvents} fallos de {domain.totalEvents} eventos ({domain.incidentRatePct}%)</p>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-[#e5ddd8] bg-[#faf6f4] px-3 py-2 text-xs text-[#726963]">
                    <span className="inline-flex items-center gap-1"><CircleOff className="h-3.5 w-3.5" />Aun no hay eventos suficientes para calcular esta vista.</span>
                  </div>
                )}
              </div>
            </article>
          ) : null}
        </div>
      </section>
    </main>
  );
}
