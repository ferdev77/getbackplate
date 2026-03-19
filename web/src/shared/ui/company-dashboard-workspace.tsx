"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Flag,
  FolderOpen,
  Megaphone,
  UsersRound,
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

type DashboardBranch = {
  id: string;
  name: string;
};

type CompanyDashboardWorkspaceProps = {
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
  employeesCount: number;
  branchesCount: number;
  checklistTodayCount: number;
  checklistWeekCount: number;
  pendingReviewCount: number;
  openFlagsCount: number;
  announcements: DashboardAnnouncement[];
  recentDocuments: DashboardDocument[];
  branchNameMap: Map<string, string>;
  branches: DashboardBranch[];
  branchFilter: string;
  searchTerm: string;
  dashboardNote: string;
  moduleStatus: DashboardModuleStatus[];
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

export function CompanyDashboardWorkspace({
  organizationName,
  organizationSlug,
  organizationStatus,
  employeesCount,
  branchesCount,
  checklistTodayCount,
  checklistWeekCount,
  pendingReviewCount,
  openFlagsCount,
  announcements,
  recentDocuments,
  branchNameMap,
  branches,
  branchFilter,
  searchTerm,
  dashboardNote,
  moduleStatus,
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
  const showReportsLink = enabledModuleSet.has("reports");

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <SlideUp>
        <section className="mb-5 rounded-2xl border border-[#e7e0dc] bg-[#fffdfa] p-6">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9d948f] uppercase">
            Dashboard Empresa
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#231f1c]">
            {organizationName}
          </h1>
          <p className="mt-1 text-sm text-[#67605b]">
            Centro operativo con estado diario, seguimiento de tareas y actividad reciente.
          </p>
        </section>
      </SlideUp>

      <AnimatedList className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AnimatedItem>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <p className="flex items-center gap-1 text-xs text-[#8a817b]"><Building2 className="h-3.5 w-3.5" /> Empresa</p>
            <p className="mt-1 text-base font-semibold">{organizationSlug}</p>
          </article>
        </AnimatedItem>
        <AnimatedItem>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <p className="flex items-center gap-1 text-xs text-[#8a817b]"><UsersRound className="h-3.5 w-3.5" /> Usuarios / Empleados</p>
            <p className="mt-1 text-2xl font-bold">{employeesCount}</p>
          </article>
        </AnimatedItem>
        <AnimatedItem>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <p className="flex items-center gap-1 text-xs text-[#8a817b]"><CheckCircle2 className="h-3.5 w-3.5" /> Checklists hoy</p>
            <p className="mt-1 text-2xl font-bold">{checklistTodayCount}</p>
          </article>
        </AnimatedItem>
        <AnimatedItem>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <p className="text-xs text-[#8a817b]">Estado tenant</p>
            <p className="mt-1 inline-block rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-sm font-semibold text-emerald-700">
              {statusLabel(organizationStatus)}
            </p>
          </article>
        </AnimatedItem>
      </AnimatedList>

      <SlideUp delay={0.1}>
        <section className="mb-5 rounded-xl border border-[#e7e0dc] bg-white p-4">
          <form className="mb-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <select
              name="branch"
              defaultValue={branchFilter}
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            >
              <option value="">Todas las sucursales</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <input
              name="q"
              defaultValue={searchTerm}
              placeholder="Buscar en anuncios/documentos"
              className="rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-lg border border-[#ddd3ce] bg-white px-3 py-2 text-sm text-[#4f4843] hover:bg-[#f8f3f1]"
            >
              Aplicar filtros
            </button>
          </form>
          <p className="mb-3 text-xs font-semibold tracking-[0.1em] text-[#8a817b] uppercase">Modulos habilitados</p>
          <div className="flex flex-wrap gap-2">
            {moduleStatus.map((moduleItem) => (
              <span
                key={moduleItem.code}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  moduleItem.enabled
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-neutral-200 bg-neutral-100 text-neutral-500"
                }`}
              >
                {moduleItem.label}
              </span>
            ))}
          </div>
        </section>
      </SlideUp>

      <section className="mb-5 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <SlideUp delay={0.2}>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#8b817c]">Acciones rapidas</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleQuickActions.map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-lg border border-[#ddd5d0] bg-[#faf8f6] px-3 py-2 text-left text-sm text-[#4f4944] hover:bg-[#f2ece8]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <action.icon className="h-4 w-4" /> {action.label}
                  </span>
                </Link>
              ))}
              {!visibleQuickActions.length ? (
                <div className="rounded-lg border border-dashed border-[#dccfca] bg-[#fffdfa] px-4 py-4 text-sm text-[#8b817c]">
                  No hay acciones rapidas disponibles con los modulos activos.
                </div>
              ) : null}
            </div>
          </article>
        </SlideUp>

        <SlideUp delay={0.25}>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#8b817c]">Seguimiento</h2>
            <div className="space-y-2">
              <div className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[#8b817c]"><CalendarClock className="h-3.5 w-3.5" /> Checklists semana</p>
                <p className="mt-1 text-xl font-bold text-[#2a2420]">{showChecklistsPanel ? checklistWeekCount : 0}</p>
              </div>
              <div className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[#8b817c]"><ClipboardCheck className="h-3.5 w-3.5" /> Pendientes de revision</p>
                <p className="mt-1 text-xl font-bold text-[#2a2420]">{showChecklistsPanel ? pendingReviewCount : 0}</p>
              </div>
              <div className="rounded-lg border border-[#f0d6d2] bg-[#fff5f3] p-3">
                <p className="inline-flex items-center gap-1 text-xs text-[#9d4a3f]"><Flag className="h-3.5 w-3.5" /> Incidencias abiertas</p>
                <p className="mt-1 text-xl font-bold text-[#8f3228]">{showChecklistsPanel ? openFlagsCount : 0}</p>
              </div>
            </div>
          </article>
        </SlideUp>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <SlideUp delay={0.3}>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#8b817c]">Avisos recientes</h2>
            <div className="space-y-2">
              {showAnnouncementsPanel && announcements.length ? (
                <AnimatedList className="space-y-2">
                  {announcements.map((notice) => (
                    <AnimatedItem key={notice.id}>
                      <div className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[#292521]">{notice.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${kindClass(notice.kind)}`}>
                            {kindLabel(notice.kind)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-[#7b736d]">
                          {notice.branch_id ? branchNameMap.get(notice.branch_id) ?? "Sucursal" : "Todas las sucursales"}
                          {notice.is_featured ? " - Fijado" : ""}
                        </p>
                        <p className="mt-1 text-xs text-[#9a918c]">
                          {notice.publish_at
                            ? `Publicado ${new Date(notice.publish_at).toLocaleDateString("es-AR")}`
                            : "Sin fecha de publicacion"}
                        </p>
                      </div>
                    </AnimatedItem>
                  ))}
                </AnimatedList>
              ) : (
                <div className="rounded-lg border border-dashed border-[#dccfca] bg-[#fffdfa] px-4 py-6 text-center text-sm text-[#8b817c]">
                  {showAnnouncementsPanel ? "Sin anuncios recientes." : "Modulo de avisos deshabilitado para esta empresa."}
                </div>
              )}
            </div>
          </article>
        </SlideUp>

        <SlideUp delay={0.35}>
          <article className="rounded-xl border border-[#e7e0dc] bg-white p-4 h-full">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#8b817c]">Documentos recientes</h2>
            <div className="space-y-2">
              {showDocumentsPanel && recentDocuments.length ? (
                <AnimatedList className="space-y-2">
                  {recentDocuments.map((doc) => (
                    <AnimatedItem key={doc.id}>
                      <div className="rounded-lg border border-[#ece4df] bg-[#fffdfa] p-3">
                        <p className="inline-flex items-center gap-1 text-sm font-medium text-[#292521]"><FileText className="h-4 w-4 text-[#7c736d]" /> {doc.title}</p>
                        <p className="mt-1 text-xs text-[#7b736d]">
                          {doc.branch_id ? branchNameMap.get(doc.branch_id) ?? "Sucursal" : "Empresa"}
                        </p>
                        <p className="mt-1 text-xs text-[#9a918c]">
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
                <div className="rounded-lg border border-dashed border-[#dccfca] bg-[#fffdfa] px-4 py-6 text-center text-sm text-[#8b817c]">
                  {showDocumentsPanel ? "No hay documentos cargados todavia." : "Modulo de documentos deshabilitado para esta empresa."}
                </div>
              )}
            </div>
          </article>
        </SlideUp>
      </section>

      <SlideUp delay={0.4}>
        <section className="mt-5 rounded-xl border border-[#e7e0dc] bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-1 text-sm font-semibold text-[#2f2925]"><AlertTriangle className="h-4 w-4 text-[#b63a2f]" /> Operacion diaria</p>
            <div className="flex flex-wrap gap-2">
              {showAnnouncementsPanel ? <Link href="/app/announcements" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd3ce] bg-white px-3 py-1.5 text-sm text-[#4f4843] hover:bg-[#f8f3f1]"><Bell className="h-4 w-4" /> Avisos</Link> : null}
              {showChecklistsPanel ? <Link href="/app/checklists" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd3ce] bg-white px-3 py-1.5 text-sm text-[#4f4843] hover:bg-[#f8f3f1]"><ClipboardCheck className="h-4 w-4" /> Checklists</Link> : null}
              {showReportsLink ? <Link href="/app/reports" className="inline-flex items-center gap-1 rounded-lg border border-[#ddd3ce] bg-white px-3 py-1.5 text-sm text-[#4f4843] hover:bg-[#f8f3f1]"><FileText className="h-4 w-4" /> Reportes</Link> : null}
            </div>
          </div>
          <p className="mt-2 text-sm text-[#6b635e]">
            Sucursales activas: {branchesCount}. Mantiene seguimiento diario desde checklists y avisos para evitar incidencias operativas.
          </p>
          {dashboardNote ? (
            <p className="mt-2 rounded-lg border border-[#ede2dd] bg-[#fff8f6] px-3 py-2 text-sm text-[#6b635e]">
              Nota interna: {dashboardNote}
            </p>
          ) : null}
        </section>
      </SlideUp>
    </main>
  );
}
