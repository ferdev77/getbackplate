"use client";

import Link from "next/link";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  FolderOpen,
  Megaphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { SlideUp, AnimatedList, AnimatedItem } from "@/shared/ui/animations";

type DashboardAnnouncement = {
  id: string;
  title: string;
  kind: string;
  is_featured: boolean;
  publish_at: string | null;
  expires_at: string | null;
  branch_id: string | null;
};

type DashboardDocument = {
  id: string;
  title: string;
  created_at: string;
  branch_id: string | null;
  file_size_bytes: number | null;
};

type DashboardModuleStatus = {
  code: string;
  label: string;
  enabled: boolean;
};

type CompanyDashboardWorkspaceProps = {
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  employeesCount: number;
  employeesOnlyCount: number;
  usersOnlyCount: number;
  branchesCount: number;
  checklistTodayCount: number;
  checklistWeekCount: number;
  pendingReviewCount: number;
  openFlagsCount: number;
  announcements: DashboardAnnouncement[];
  recentDocuments: DashboardDocument[];
  branchNameMap: Map<string, string>;
  moduleStatus: DashboardModuleStatus[];
  selectedLocationName?: string | null;
  deferredDataUrl?: string;
};

function kindLabel(kind: string) {
  if (kind === "urgent") return "Urgente";
  if (kind === "reminder") return "Recordatorio";
  if (kind === "celebration") return "Celebracion";
  return "General";
}

function kindClass(kind: string) {
  if (kind === "urgent") return "border-rose-200 bg-rose-50 text-rose-700";
  if (kind === "reminder") return "border-amber-200 bg-amber-50 text-amber-700";
  if (kind === "celebration") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusLabel(status: string) {
  if (status === "active") return "Activa";
  if (status === "paused") return "Pausada";
  if (status === "suspended") return "Suspendida";
  return status;
}

const QUICK_ACTIONS = [
  { href: "/app/announcements", label: "Publicar aviso", icon: Megaphone, moduleCode: "announcements" },
  { href: "/app/checklists", label: "Crear checklist", icon: ClipboardCheck, moduleCode: "checklists" },
  { href: "/app/documents", label: "Subir documento", icon: FolderOpen, moduleCode: "documents" },
  { href: "/app/employees", label: "Agregar usuario/empleado", icon: UsersRound, moduleCode: "employees" },
];

function DashboardMetricCard({
  icon: Icon,
  label,
  value,
  subtitle,
  details,
  progress,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  details: Array<{ label: string; value: string | number }>;
  progress?: { value: number; label: string };
}) {
  return (
    <article className="group flex h-full flex-col rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 transition hover:-translate-y-[1px] hover:shadow-[0_10px_26px_rgba(0,0,0,.09)]">
      <p className="flex items-center gap-1 text-xs text-[var(--gbp-text2)]"><Icon className="h-3.5 w-3.5" /> {label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{value}</p>
      {subtitle ? <p className="mt-1 text-[11px] text-[var(--gbp-text2)]">{subtitle}</p> : null}
      {progress ? (
        <>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--gbp-border)]">
            <div className="h-full rounded-full bg-[var(--gbp-accent)]" style={{ width: `${Math.max(0, Math.min(progress.value, 100))}%` }} />
          </div>
          <p className="mt-1 text-[10px] text-[var(--gbp-muted)]">{progress.label}</p>
        </>
      ) : null}
      <div className="mt-auto rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-2 pt-2 transition duration-200 group-hover:border-[var(--gbp-border2)] group-hover:bg-[var(--gbp-surface2)]">
        <div className="grid gap-1">
          {details.map((detail) => (
            <p key={detail.label} className="flex items-center justify-between gap-2 text-[11px] text-[var(--gbp-text2)]">
              <span>{detail.label}</span>
              <span className="font-semibold text-[var(--gbp-text)]">{detail.value}</span>
            </p>
          ))}
        </div>
      </div>
    </article>
  );
}

export function CompanyDashboardWorkspace({
  organizationName,
  organizationSlug,
  organizationStatus,
  employeesCount,
  employeesOnlyCount,
  usersOnlyCount,
  branchesCount,
  checklistTodayCount,
  checklistWeekCount,
  pendingReviewCount,
  openFlagsCount,
  announcements,
  recentDocuments,
  branchNameMap,
  moduleStatus,
  selectedLocationName,
  deferredDataUrl,
}: CompanyDashboardWorkspaceProps) {
  const [metrics, setMetrics] = useState(() => ({
    employeesCount,
    employeesOnlyCount,
    usersOnlyCount,
    branchesCount,
    checklistTodayCount,
    checklistWeekCount,
    pendingReviewCount,
    openFlagsCount,
    announcements,
    recentDocuments,
  }));

  useEffect(() => {
    if (!deferredDataUrl) return;

    const controller = new AbortController();
    void fetch(deferredDataUrl, { method: "GET", cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        setMetrics((prev) => ({
          employeesCount: typeof data?.employeesCount === "number" ? data.employeesCount : prev.employeesCount,
          employeesOnlyCount: typeof data?.employeesOnlyCount === "number" ? data.employeesOnlyCount : prev.employeesOnlyCount,
          usersOnlyCount: typeof data?.usersOnlyCount === "number" ? data.usersOnlyCount : prev.usersOnlyCount,
          branchesCount: typeof data?.branchesCount === "number" ? data.branchesCount : prev.branchesCount,
          checklistTodayCount: typeof data?.checklistTodayCount === "number" ? data.checklistTodayCount : prev.checklistTodayCount,
          checklistWeekCount: typeof data?.checklistWeekCount === "number" ? data.checklistWeekCount : prev.checklistWeekCount,
          pendingReviewCount: typeof data?.pendingReviewCount === "number" ? data.pendingReviewCount : prev.pendingReviewCount,
          openFlagsCount: typeof data?.openFlagsCount === "number" ? data.openFlagsCount : prev.openFlagsCount,
          announcements: Array.isArray(data?.announcements) ? data.announcements : prev.announcements,
          recentDocuments: Array.isArray(data?.recentDocuments) ? data.recentDocuments : prev.recentDocuments,
        }));
      })
      .catch(() => {
        // keep current snapshot if deferred fetch fails
      });

    return () => controller.abort();
  }, [
    announcements,
    branchesCount,
    checklistTodayCount,
    checklistWeekCount,
    deferredDataUrl,
    employeesCount,
    employeesOnlyCount,
    openFlagsCount,
    pendingReviewCount,
    recentDocuments,
    usersOnlyCount,
  ]);

  const effectiveMetrics = deferredDataUrl
    ? metrics
    : {
        employeesCount,
        employeesOnlyCount,
        usersOnlyCount,
        branchesCount,
        checklistTodayCount,
        checklistWeekCount,
        pendingReviewCount,
        openFlagsCount,
        announcements,
        recentDocuments,
      };

  const enabledModuleSet = new Set(
    moduleStatus.filter((module) => module.enabled).map((module) => module.code),
  );
  const visibleQuickActions = QUICK_ACTIONS.filter((action) =>
    enabledModuleSet.has(action.moduleCode),
  );
  const showAnnouncementsPanel = enabledModuleSet.has("announcements");
  const showChecklistsPanel = enabledModuleSet.has("checklists");
  const workforceTotal = effectiveMetrics.employeesOnlyCount + effectiveMetrics.usersOnlyCount;
  const employeeRatio = workforceTotal > 0 ? Math.round((effectiveMetrics.employeesOnlyCount / workforceTotal) * 100) : 0;
  const checklistsTodayValue = showChecklistsPanel ? effectiveMetrics.checklistTodayCount : 0;
  const checklistsWeekValue = showChecklistsPanel ? effectiveMetrics.checklistWeekCount : 0;
  const pendingReviewValue = showChecklistsPanel ? effectiveMetrics.pendingReviewCount : 0;
  const openFlagsValue = showChecklistsPanel ? effectiveMetrics.openFlagsCount : 0;
  const announcementsCount = showAnnouncementsPanel ? effectiveMetrics.announcements.length : 0;
  const featuredAnnouncementsCount = showAnnouncementsPanel
    ? effectiveMetrics.announcements.filter((notice) => notice.is_featured).length
    : 0;
  const urgentAnnouncementsCount = showAnnouncementsPanel
    ? effectiveMetrics.announcements.filter((notice) => notice.kind === "urgent").length
    : 0;
  const companyWideAnnouncementsCount = showAnnouncementsPanel
    ? effectiveMetrics.announcements.filter((notice) => !notice.branch_id).length
    : 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      {!selectedLocationName ? (
        <SlideUp>
          <section className="mb-5 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--gbp-muted)]">
              Dashboard Empresa
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--gbp-text)]">
              {organizationName}
            </h1>
            <p className="mt-1 text-sm text-[var(--gbp-text2)]">
              Centro operativo con estado diario, seguimiento de tareas y actividad reciente.
            </p>
          </section>
        </SlideUp>
      ) : null}

      <AnimatedList className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatedItem>
          <DashboardMetricCard
            icon={Building2}
            label="Empresa"
            value={organizationSlug}
            subtitle={organizationName}
            details={[
              { label: "Estado", value: statusLabel(organizationStatus) },
              { label: "Sucursales activas", value: effectiveMetrics.branchesCount },
              { label: "Vista", value: selectedLocationName ? `Locación: ${selectedLocationName}` : "General" },
            ]}
          />
        </AnimatedItem>
        <AnimatedItem>
          <DashboardMetricCard
            icon={UsersRound}
            label="Usuarios / Empleados"
            value={effectiveMetrics.employeesCount}
            subtitle={`Empleados: ${effectiveMetrics.employeesOnlyCount} · Usuarios: ${effectiveMetrics.usersOnlyCount}`}
            progress={{ value: employeeRatio, label: `Composición laboral: ${employeeRatio}% empleados` }}
            details={[
              { label: "Empleados", value: effectiveMetrics.employeesOnlyCount },
              { label: "Usuarios", value: effectiveMetrics.usersOnlyCount },
              { label: "Total workforce", value: workforceTotal },
            ]}
          />
        </AnimatedItem>
        <AnimatedItem>
          <DashboardMetricCard
            icon={CheckCircle2}
            label="Checklists hoy"
            value={checklistsTodayValue}
            subtitle={showChecklistsPanel ? "Actividad del día en curso" : "Módulo deshabilitado"}
            details={[
              { label: "Semana", value: checklistsWeekValue },
              { label: "Pendientes", value: pendingReviewValue },
              { label: "Incidencias", value: openFlagsValue },
            ]}
          />
        </AnimatedItem>
        <AnimatedItem>
          <DashboardMetricCard
            icon={Megaphone}
            label="Avisos"
            value={announcementsCount}
            subtitle={showAnnouncementsPanel ? "Publicaciones recientes" : "Módulo deshabilitado"}
            details={[
              { label: "Urgentes", value: urgentAnnouncementsCount },
              { label: "Fijados", value: featuredAnnouncementsCount },
              { label: "Toda la empresa", value: companyWideAnnouncementsCount },
            ]}
          />
        </AnimatedItem>
      </AnimatedList>

      <section className="mb-5">
        <SlideUp delay={0.2}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Acciones rápidas</h2>
            <div className="flex w-full gap-2">
              {visibleQuickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="flex min-w-0 flex-1 items-center justify-center rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-center text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                >
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
                    <action.icon className="h-4 w-4" /> {action.label}
                  </span>
                </Link>
              ))}
              {!visibleQuickActions.length ? (
                <div className="w-full rounded-lg border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-4 text-sm text-[var(--gbp-text2)]">
                  No hay acciones rápidas disponibles con los módulos activos.
                </div>
              ) : null}
            </div>
          </article>
        </SlideUp>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SlideUp delay={0.3}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Avisos recientes</h2>
            <div className="space-y-2">
              {showAnnouncementsPanel && effectiveMetrics.announcements.length ? (
                <AnimatedList className="space-y-2">
                  {effectiveMetrics.announcements.map((notice) => (
                    <AnimatedItem key={notice.id}>
                      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--gbp-text)]">{notice.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${kindClass(notice.kind)}`}>
                            {kindLabel(notice.kind)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[var(--gbp-text2)]">
                          {notice.branch_id ? branchNameMap.get(notice.branch_id) ?? "Sucursal" : "Todas las sucursales"}
                          {notice.is_featured ? " - Fijado" : ""}
                        </p>
                        <p className="mt-1 text-xs text-[var(--gbp-muted)]">
                          {notice.publish_at
                            ? `Publicado ${new Date(notice.publish_at).toLocaleDateString("es-AR")}`
                            : "Sin fecha de publicación"}
                        </p>
                      </div>
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-6 text-center text-sm text-[var(--gbp-text2)]">
                  {showAnnouncementsPanel ? "Sin anuncios recientes." : "Módulo de avisos deshabilitado para esta empresa."}
                </div>
              )}
            </div>
          </article>
        </SlideUp>

        <SlideUp delay={0.35}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Seguimiento de checklist</h2>
            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[var(--gbp-text2)]"><CalendarClock className="h-3.5 w-3.5" /> Checklists semana</p>
                <p className="mt-1 text-xl font-bold text-[var(--gbp-text)]">{showChecklistsPanel ? effectiveMetrics.checklistWeekCount : 0}</p>
              </div>
              <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[var(--gbp-text2)]"><ClipboardCheck className="h-3.5 w-3.5" /> Pendientes de revision</p>
                <p className="mt-1 text-xl font-bold text-[var(--gbp-text)]">{showChecklistsPanel ? effectiveMetrics.pendingReviewCount : 0}</p>
              </div>
              <div className="rounded-lg border border-[var(--gbp-error)]/30 bg-[var(--gbp-error-soft)] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[var(--gbp-error)]"><Flag className="h-3.5 w-3.5" /> Incidencias abiertas</p>
                <p className="mt-1 text-xl font-bold text-[var(--gbp-error)]">{showChecklistsPanel ? effectiveMetrics.openFlagsCount : 0}</p>
              </div>
            </div>
          </article>
        </SlideUp>
      </section>

    </main>
  );
}
