import {
  Activity,
  ArrowRight,
  AlertTriangle,
  Building2,
  FileText,
  Layers3,
  Timer,
  Megaphone,
  ClipboardList,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import * as motion from "framer-motion/client";

import {
  getSuperadminHealthMetrics,
  getSuperadminObservabilityMetrics,
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

function invitedFirstLoginTone(status: "pending" | "completed" | "none") {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "pending") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function invitedFirstLoginText(status: "pending" | "completed" | "none") {
  if (status === "completed") return "Primer ingreso invitado: Completado";
  if (status === "pending") return "Primer ingreso invitado: Pendiente";
  return "Primer ingreso invitado: Sin dato";
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
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[linear-gradient(145deg,var(--gbp-text)_0%,color-mix(in_oklab,var(--gbp-text)_88%,black)_100%)] p-8 text-white shadow-2xl">
        <div className="pointer-events-none absolute -right-14 -top-16 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(192,57,43,.40)_0%,transparent_70%)] opacity-50" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle,rgba(255,255,255,.1)_0%,transparent_70%)] opacity-30" />
        
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-8">
          <div className="max-w-xl">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded-full bg-brand/20 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-brand-light ring-1 ring-brand/30">Control Central</span>
              <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
            <h1 className="font-serif text-4xl font-light tracking-tight sm:text-5xl">Panel de Control</h1>
            <p className="mt-4 text-base leading-relaxed text-white/70">
              Visibilidad operativa en tiempo real del ecosistema. Monitorea riesgos, actividad y cobertura de servicios por organización.
            </p>
          </div>
          
          <div className="flex items-center gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-md">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
              <TrendingUp className="h-6 w-6 text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/65">Salud del Ecosistema</p>
              <div className="flex items-baseline gap-2">
                <p className="font-serif text-4xl font-medium tracking-tighter">{healthyOrgs}</p>
                <p className="text-sm text-white/65">sanos de {orgCount}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Organizaciones", val: orgCount, icon: Building2, color: "text-[var(--gbp-text)]", bg: "bg-[var(--gbp-surface)]", border: "border-[var(--gbp-border)]" },
          { label: "Módulos Activos", val: modulesCount, icon: Layers3, color: "text-[var(--gbp-text)]", bg: "bg-[var(--gbp-surface)]", border: "border-[var(--gbp-border)]" },
          { label: "Técnicamente Sanos", val: healthyOrgs, icon: ShieldCheck, color: "text-emerald-700", bg: "bg-emerald-50/50", border: "border-emerald-100" },
          { label: "Riesgo Detectado", val: orgsWithRisk, icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50/50", border: "border-red-100" },
        ].map((stat, idx) => (
          <motion.article 
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className={`group rounded-3xl border ${stat.border} ${stat.bg} p-5 transition-all hover:shadow-lg hover:shadow-black/5`}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <stat.icon className="h-3.5 w-3.5" /> {stat.label}
              </p>
            </div>
            <p className={`font-serif text-3xl font-medium ${stat.color}`}>{stat.val}</p>
          </motion.article>
        ))}
      </section>

      <section className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
        <article className="overflow-hidden rounded-[2.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm transition-all hover:shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--gbp-border)] px-6 py-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-foreground">Radar de Organizaciones</h2>
              <p className="max-w-md text-sm text-muted-foreground">Top 10 entidades con mayor riesgo operativo basado en configuración y uso.</p>
            </div>
            <Link 
              href="/superadmin/organizations" 
              className="inline-flex items-center gap-2 rounded-xl bg-muted/50 px-4 py-2 text-xs font-bold text-foreground transition-all hover:bg-muted"
            >
              Gestionar todas <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-[var(--gbp-border)]">
            {topByRisk.map((row) => (
              <div key={row.organizationId} className="group px-6 py-5 transition-colors hover:bg-muted/30">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-brand/5 flex items-center justify-center border border-brand/10 text-brand font-bold text-sm">
                      {row.name.charAt(0)}
                    </div>
                    <p className="text-[15px] font-bold text-foreground">{row.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter ${statusTone(row.status)}`}>
                      {row.status}
                    </span>
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-black ${scoreTone(row.score)}`}>
                      SCORE {row.score}
                    </span>
                  </div>
                </div>
                
                <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-[var(--gbp-surface2)]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(8, row.score)}%` }}
                    className={`h-full rounded-full ${scoreBar(row.score)} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} 
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-[13px] text-muted-foreground sm:grid-cols-4">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    <span>Admins: <strong className="text-foreground font-semibold">{row.activeAdmins}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    <span>Usuarios: <strong className="text-foreground font-semibold">{row.activeMembers}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    <span>Empleados: <strong className="text-foreground font-semibold">{row.activeEmployees}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                    <span>Módulos: <strong className="text-foreground font-semibold">{row.enabledModules}</strong></span>
                  </div>
                </div>
                
                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--gbp-border)] pt-4">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><FileText className="h-4 w-4 text-brand/60" /> {row.docs30d} docs</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ClipboardList className="h-4 w-4 text-brand/60" /> {row.checklist7d} checks</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Megaphone className="h-4 w-4 text-brand/60" /> {row.activeAnnouncements} avisos</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${invitedFirstLoginTone(row.invitedAdminFirstLoginStatus)}`}>
                    {invitedFirstLoginText(row.invitedAdminFirstLoginStatus)}
                  </span>
                  {row.invitedAdminFirstLoginStatus === "completed" && row.invitedAdminFirstLoginAt ? (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(row.invitedAdminFirstLoginAt).toLocaleString("es-ES")}
                    </span>
                  ) : null}
                  {row.invitedAdminEmail ? (
                    <span className="text-[10px] text-muted-foreground">{row.invitedAdminEmail}</span>
                  ) : null}
                  <div className="ml-auto text-xs font-medium text-muted-foreground bg-muted/40 px-3 py-1 rounded-lg border border-line/30">
                    Storage: <span className="text-foreground font-bold">{formatStorage(row.storageMb)}</span>
                    <span className="opacity-50"> / {row.storageLimitMb != null ? formatStorage(row.storageLimitMb) : "∞"}</span>
                  </div>
                </div>

                {row.issues.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {row.issues.map((issue) => (
                      <span key={`${row.organizationId}-${issue}`} className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700">
                        <AlertTriangle className="h-3 w-3" /> {issue}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </article>

        <aside className="space-y-4">
          <article className="rounded-3xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-tight text-foreground uppercase">
              <Activity className="h-4 w-4 text-brand" /> Actividad Global
            </h3>
            <div className="space-y-3">
              {[
                { label: "Docs (30d)", val: docs30dTotal, icon: FileText },
                { label: "Storage", val: formatStorage(storageMbTotal), icon: Layers3 },
                { label: "Checklists (7d)", val: checklist7dTotal, icon: ClipboardList },
                { label: "Avisos Activos", val: announcementsTotal, icon: Megaphone },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3">
                  <span className="text-[13px] font-medium text-muted-foreground">{item.label}</span>
                  <strong className="text-[15px] font-bold text-foreground">{item.val}</strong>
                </div>
              ))}
            </div>
          </article>

          {SHOW_OBSERVABILITY_CARD && observability && (
             <article className="rounded-3xl border border-line/60 bg-white p-6 shadow-sm">
               <h3 className="mb-4 flex items-center gap-2 text-sm font-bold tracking-tight text-foreground uppercase">
                 <Timer className="h-4 w-4 text-brand" /> Observabilidad
               </h3>
               {/* ... observability content could go here if enabled ... */}
             </article>
          )}

          <article className="rounded-3xl border border-[color:color-mix(in_oklab,var(--gbp-accent)_25%,transparent)] bg-[var(--gbp-accent-glow)] p-6 border-dashed">
            <p className="text-xs font-bold text-[var(--gbp-accent)] uppercase tracking-widest mb-2">Tip de operación</p>
            <p className="text-sm leading-relaxed text-[var(--gbp-text2)]">
              Las organizaciones con score inferior a <span className="font-bold">60</span> suelen carecer de un administrador asignado o no han registrado actividad en los últimos 15 días.
            </p>
          </article>
        </aside>
      </section>
    </main>
  );
}
