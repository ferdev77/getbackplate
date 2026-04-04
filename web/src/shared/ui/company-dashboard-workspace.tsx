"use client";

import Link from "next/link";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Flag,
  FolderOpen,
  Megaphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
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
  { href: "/app/documents", label: "Subir documento", icon: FolderOpen, moduleCode: "documents" },
  { href: "/app/announcements", label: "Publicar aviso", icon: Megaphone, moduleCode: "announcements" },
  { href: "/app/checklists", label: "Crear checklist", icon: ClipboardCheck, moduleCode: "checklists" },
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
}: CompanyDashboardWorkspaceProps) {
  const enabledModuleSet = new Set(
    moduleStatus.filter((module) => module.enabled).map((module) => module.code),
  );
  const visibleQuickActions = QUICK_ACTIONS.filter((action) =>
    enabledModuleSet.has(action.moduleCode),
  );
  const showAnnouncementsPanel = enabledModuleSet.has("announcements");
  const showDocumentsPanel = enabledModuleSet.has("documents");
  const showChecklistsPanel = enabledModuleSet.has("checklists");
  const workforceTotal = employeesOnlyCount + usersOnlyCount;
  const employeeRatio = workforceTotal > 0 ? Math.round((employeesOnlyCount / workforceTotal) * 100) : 0;
  const checklistsTodayValue = showChecklistsPanel ? checklistTodayCount : 0;
  const checklistsWeekValue = showChecklistsPanel ? checklistWeekCount : 0;
  const pendingReviewValue = showChecklistsPanel ? pendingReviewCount : 0;
  const openFlagsValue = showChecklistsPanel ? openFlagsCount : 0;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
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

      <AnimatedList className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatedItem>
          <DashboardMetricCard
            icon={Building2}
            label="Empresa"
            value={organizationSlug}
            subtitle={organizationName}
            details={[
              { label: "Estado", value: statusLabel(organizationStatus) },
              { label: "Sucursales activas", value: branchesCount },
              { label: "Vista", value: selectedLocationName ? `Locacion: ${selectedLocationName}` : "General" },
            ]}
          />
        </AnimatedItem>
        <AnimatedItem>
          <DashboardMetricCard
            icon={UsersRound}
            label="Usuarios / Empleados"
            value={employeesCount}
            subtitle={`Empleados: ${employeesOnlyCount} · Usuarios: ${usersOnlyCount}`}
            progress={{ value: employeeRatio, label: `Composicion laboral: ${employeeRatio}% empleados` }}
            details={[
              { label: "Empleados", value: employeesOnlyCount },
              { label: "Usuarios", value: usersOnlyCount },
              { label: "Total workforce", value: workforceTotal },
            ]}
          />
        </AnimatedItem>
        <AnimatedItem>
          <DashboardMetricCard
            icon={CheckCircle2}
            label="Checklists hoy"
            value={checklistsTodayValue}
            subtitle={showChecklistsPanel ? "Actividad del dia en curso" : "Modulo deshabilitado"}
            details={[
              { label: "Semana", value: checklistsWeekValue },
              { label: "Pendientes", value: pendingReviewValue },
              { label: "Incidencias", value: openFlagsValue },
            ]}
          />
        </AnimatedItem>
        <AnimatedItem>
          <article className="group flex h-full flex-col rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 transition hover:-translate-y-[1px] hover:shadow-[0_10px_26px_rgba(0,0,0,.09)]">
            <p className="text-xs text-[var(--gbp-text2)]">Estado de empresa</p>
            <p className="mt-1 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-700">
              {statusLabel(organizationStatus)}
            </p>
            <div className="mt-auto rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-2 pt-2 transition duration-200 group-hover:border-[var(--gbp-border2)] group-hover:bg-[var(--gbp-surface2)]">
              <p className="flex items-center justify-between gap-2 text-[11px] text-[var(--gbp-text2)]"><span>Pendientes revision</span><span className="font-semibold text-[var(--gbp-text)]">{pendingReviewValue}</span></p>
              <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--gbp-text2)]"><span>Incidencias abiertas</span><span className="font-semibold text-[var(--gbp-text)]">{openFlagsValue}</span></p>
              <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-[var(--gbp-text2)]"><span>Checklists semana</span><span className="font-semibold text-[var(--gbp-text)]">{checklistsWeekValue}</span></p>
            </div>
          </article>
        </AnimatedItem>
      </AnimatedList>

      <section className="mb-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <SlideUp delay={0.2}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Acciones rapidas</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleQuickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-left text-sm text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <action.icon className="h-4 w-4" /> {action.label}
                  </span>
                </Link>
              ))}
              {!visibleQuickActions.length ? (
                <div className="rounded-lg border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-4 text-sm text-[var(--gbp-text2)]">
                  No hay acciones rapidas disponibles con los modulos activos.
                </div>
              ) : null}
            </div>
          </article>
        </SlideUp>

        <SlideUp delay={0.25}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Seguimiento de checklist</h2>
            <div className="space-y-2">
              <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[var(--gbp-text2)]"><CalendarClock className="h-3.5 w-3.5" /> Checklists semana</p>
                <p className="mt-1 text-xl font-bold text-[var(--gbp-text)]">{showChecklistsPanel ? checklistWeekCount : 0}</p>
              </div>
              <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[var(--gbp-text2)]"><ClipboardCheck className="h-3.5 w-3.5" /> Pendientes de revision</p>
                <p className="mt-1 text-xl font-bold text-[var(--gbp-text)]">{showChecklistsPanel ? pendingReviewCount : 0}</p>
              </div>
              <div className="rounded-lg border border-[var(--gbp-error)]/30 bg-[var(--gbp-error-soft)] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[var(--gbp-error)]"><Flag className="h-3.5 w-3.5" /> Incidencias abiertas</p>
                <p className="mt-1 text-xl font-bold text-[var(--gbp-error)]">{showChecklistsPanel ? openFlagsCount : 0}</p>
              </div>
            </div>
          </article>
        </SlideUp>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SlideUp delay={0.3}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Avisos recientes</h2>
            <div className="space-y-2">
              {showAnnouncementsPanel && announcements.length ? (
                <AnimatedList className="space-y-2">
                  {announcements.map((notice) => (
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
                            : "Sin fecha de publicacion"}
                        </p>
                      </div>
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-6 text-center text-sm text-[var(--gbp-text2)]">
                  {showAnnouncementsPanel ? "Sin anuncios recientes." : "Modulo de avisos deshabilitado para esta empresa."}
                </div>
              )}
            </div>
          </article>
        </SlideUp>

        <SlideUp delay={0.35}>
          <article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--gbp-text2)]">Documentos recientes</h2>
            <div className="space-y-2">
              {showDocumentsPanel && recentDocuments.length ? (
                <AnimatedList className="space-y-2">
                  {recentDocuments.map((doc) => (
                    <AnimatedItem key={doc.id}>
                      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                        <p className="inline-flex items-center gap-1 text-sm font-medium text-[var(--gbp-text)]"><FileText className="h-4 w-4 text-[var(--gbp-text2)]" /> {doc.title}</p>
                        <p className="mt-1 text-xs text-[var(--gbp-text2)]">
                          {doc.branch_id ? branchNameMap.get(doc.branch_id) ?? "Sucursal" : "Empresa"}
                        </p>
                        <p className="mt-1 text-xs text-[var(--gbp-muted)]">
                          {new Date(doc.created_at).toLocaleDateString("es-AR")}
                          {typeof doc.file_size_bytes === "number"
                            ? ` - ${Math.max(Math.round(doc.file_size_bytes / 1024), 1)} KB`
                            : ""}
                        </p>
                      </div>
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              ) : (
                <div className="rounded-lg border border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-6 text-center text-sm text-[var(--gbp-text2)]">
                  {showDocumentsPanel ? "No hay documentos cargados todavia." : "Modulo de documentos deshabilitado para esta empresa."}
                </div>
              )}
            </div>
          </article>
        </SlideUp>
      </section>

    </main>
  );
}
