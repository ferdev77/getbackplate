import { BellPlus, Pencil, Pin } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/shared/ui/empty-state";
import { TooltipLabel } from "@/shared/ui/tooltip";

import { parseAnnouncementScope } from "@/modules/announcements/lib/scope";
import { AnnouncementModalTrigger } from "@/modules/announcements/ui/announcement-modal-trigger";
import {
  deleteAnnouncementAction,
  toggleAnnouncementFeaturedAction,
} from "@/modules/announcements/actions";
import { AnnouncementCard } from "@/modules/announcements/ui/announcement-card";
import { requireTenantModule } from "@/shared/lib/access";
import { AnnouncementCreateModal } from "@/shared/ui/announcement-create-modal";
import { ConfirmSubmitButton } from "@/shared/ui/confirm-submit-button";
import { SlideUp } from "@/shared/ui/animations";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";
import { PageContent } from "@/shared/ui/page-content";
import { getAnnouncementPageData } from "@/modules/announcements/queries";

type CompanyAnnouncementsPageProps = {
  searchParams: Promise<{
    status?: string;
    message?: string;
    action?: string;
    announcementId?: string;
    creator?: string;
  }>;
};

const TEXT_STRONG = "text-[var(--gbp-text)]";
const TEXT_MUTED = "text-[var(--gbp-text2)]";
const CARD = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]";
const ACTION_BTN_NEUTRAL = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_DANGER = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

export default async function CompanyAnnouncementsPage({ searchParams }: CompanyAnnouncementsPageProps) {
  const tenant = await requireTenantModule("announcements");
  const params = await searchParams;
  const action = String(params.action ?? "").trim().toLowerCase();
  const creatorFilter = String(params.creator ?? "all").trim().toLowerCase();
  const openCreateModal = action === "create" || action === "edit";

  const {
    announcements,
    branches: mappedBranches,
    departments,
    positions,
    branchNameMap,
    departmentNameMap,
    positionNameMap,
    authorNameMap,
    employeeNameByUserId,
    adminUserIds,
    scopeUsers,
    publisherName,
  } = await getAnnouncementPageData(tenant.organizationId);

  const announcementTimestamp = (row: { publish_at: string | null; created_at: string }) => {
    const dateValue = row.publish_at ?? row.created_at;
    const timestamp = new Date(dateValue).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
  };

  const orderedAnnouncements = [...announcements].sort((a, b) => {
    if (Boolean(a.is_featured) !== Boolean(b.is_featured)) return a.is_featured ? -1 : 1;
    return announcementTimestamp(b) - announcementTimestamp(a);
  });

  const latestAnnouncement = [...announcements].sort(
    (a, b) => announcementTimestamp(b) - announcementTimestamp(a),
  )[0] ?? null;

  const announcementsWithCreatorKind = orderedAnnouncements.map((ann) => ({
    ...ann,
    creator_kind: adminUserIds.has(ann.created_by ?? "") ? "admin" : "employee",
  }));

  const adminAnnouncementsCount = announcementsWithCreatorKind.filter((ann) => ann.creator_kind === "admin").length;
  const employeeAnnouncementsCount = announcementsWithCreatorKind.filter((ann) => ann.creator_kind === "employee").length;

  const filteredAnnouncements = announcementsWithCreatorKind.filter((ann) => {
    if (creatorFilter === "admin") return ann.creator_kind === "admin";
    if (creatorFilter === "employee") return ann.creator_kind === "employee";
    return true;
  });

  const now = new Date();
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);
  const porVencer = announcements.filter((row) => {
    if (!row.expires_at) return false;
    const exp = new Date(row.expires_at);
    return exp >= now && exp <= in7Days;
  }).length;

  const latestDate = latestAnnouncement ? (latestAnnouncement.publish_at ?? latestAnnouncement.created_at) : null;
  const today = new Date().toISOString().slice(0, 10);

  const editingAnnouncement = action === "edit"
    ? announcements.find((row) => row.id === params.announcementId)
    : null;

  const filterHref = (value: "all" | "admin" | "employee") => {
    const q = new URLSearchParams();
    if (params.status) q.set("status", params.status);
    if (params.message) q.set("message", params.message);
    if (value !== "all") q.set("creator", value);
    const query = q.toString();
    return query ? `/app/announcements?${query}` : "/app/announcements";
  };

  return (
    <PageContent>
      <SlideUp>
        <OperationHeaderCard
          eyebrow="Operación diaria"
          title="Mis Avisos"
          description="Publica comunicados internos, gestiona su alcance y administra fijados, edición y eliminación."
          eyebrowClassName={`text-[11px] font-semibold tracking-[0.14em] uppercase ${TEXT_MUTED}`}
          titleClassName={`mt-1 text-2xl font-bold tracking-tight ${TEXT_STRONG}`}
          descriptionClassName={`mt-1 text-sm ${TEXT_MUTED}`}
          action={(
            <AnnouncementModalTrigger
              className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white hover:bg-[var(--gbp-accent)]"
              mode="create"
              publisherName={publisherName}
              branches={mappedBranches}
              departments={departments ?? []}
              positions={positions ?? []}
              users={scopeUsers}
            >
              <BellPlus className="h-3.5 w-3.5" /> Nuevo Aviso
            </AnnouncementModalTrigger>
          )}
        />
      </SlideUp>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Avisos activos</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{announcements?.length ?? 0}</p><p className={`text-[11px] ${TEXT_MUTED}`}>En todas las locaciones</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Fijados</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{(announcements ?? []).filter((row) => row.is_featured).length}</p><p className={`text-[11px] ${TEXT_MUTED}`}>Visible al top</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Por vencer</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{porVencer}</p><p className={`text-[11px] ${TEXT_MUTED}`}>Esta semana</p></article>
        </div>
        <div className="h-full">
          <article className={`h-full rounded-xl border p-4 ${CARD}`}><p className={`text-xs ${TEXT_MUTED}`}>Última publicación</p><p className={`mt-1 text-2xl font-bold ${TEXT_STRONG}`}>{latestDate ? new Date(latestDate).toLocaleDateString("es-US", { day: "2-digit", month: "short" }) : "-"}</p><p className={`text-[11px] ${TEXT_MUTED}`}>{latestAnnouncement ? authorNameMap.get(latestAnnouncement.created_by ?? "") || "Dirección General" : "Sin avisos"}</p></article>
        </div>
      </div>

      <SlideUp delay={0.1}>
        <p className={`mb-2 text-[11px] font-bold tracking-[0.11em] uppercase ${TEXT_MUTED}`}>Avisos publicados</p>
      </SlideUp>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link
          href={filterHref("all")}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${creatorFilter === "all" ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"}`}
        >
          Todos ({announcementsWithCreatorKind.length})
        </Link>
        <Link
          href={filterHref("admin")}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${creatorFilter === "admin" ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"}`}
        >
          Creados por Admin ({adminAnnouncementsCount})
        </Link>
        <Link
          href={filterHref("employee")}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${creatorFilter === "employee" ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"}`}
        >
          Creados por Empleados ({employeeAnnouncementsCount})
        </Link>
      </div>

      <section className="space-y-3">
        {filteredAnnouncements.length > 0 ? (
          <div className="space-y-3">
            {filteredAnnouncements.map((ann) => {
              const targetForEdit = parseAnnouncementScope(ann.target_scope);
              return (
                <div key={ann.id}>
                  <AnnouncementCard
                    announcement={ann}
                    authorName={authorNameMap.get(ann.created_by ?? "") || "Dirección General"}
                    todayIso={today}
                    branchNameMap={branchNameMap}
                    departmentNameMap={departmentNameMap}
                    positionNameMap={positionNameMap}
                    actions={(
                      <>
                        <form action={toggleAnnouncementFeaturedAction}>
                          <input type="hidden" name="announcement_id" value={ann.id} />
                          <input type="hidden" name="next_featured" value={String(!ann.is_featured)} />
                          <button className={ann.is_featured ? ACTION_BTN_DANGER : ACTION_BTN_NEUTRAL} type="submit"><Pin className="h-3.5 w-3.5" /><TooltipLabel label={ann.is_featured ? "Quitar fijado" : "Fijar"} /></button>
                        </form>
                        <AnnouncementModalTrigger
                          className={ACTION_BTN_NEUTRAL}
                          mode="edit"
                          publisherName={publisherName}
                          branches={mappedBranches}
                          departments={departments ?? []}
                          positions={positions ?? []}
                            users={scopeUsers}
                            initial={{
                              id: ann.id,
                              kind: ann.kind,
                              title: ann.title,
                              body: ann.body,
                              expires_at: ann.expires_at,
                              is_featured: ann.is_featured,
                              location_scope: targetForEdit.locations,
                              department_scope: targetForEdit.department_ids,
                              position_scope: targetForEdit.position_ids,
                              user_scope: targetForEdit.users,
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          <TooltipLabel label="Editar" />
                        </AnnouncementModalTrigger>
                        <form action={deleteAnnouncementAction}>
                          <input type="hidden" name="announcement_id" value={ann.id} />
                          <ConfirmSubmitButton
                            label="🗑"
                            confirmTitle="Eliminar aviso"
                            confirmDescription="Se eliminará el aviso y su audiencia. Esta acción no se puede deshacer."
                            confirmLabel="Eliminar"
                            className={ACTION_BTN_DANGER}
                            data-testid="delete-announcement-btn"
                          />
                        </form>
                      </>
                    )}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <SlideUp delay={0.2}>
            <EmptyState title="Sin resultados para este filtro" description="Cambia el filtro para ver más avisos o publica uno nuevo." />
          </SlideUp>
        )}
      </section>

      {openCreateModal ? (
        <AnnouncementCreateModal
          branches={mappedBranches}
          departments={departments ?? []}
          positions={positions ?? []}
          users={scopeUsers}
          publisherName={publisherName}
          mode={action === "edit" ? "edit" : "create"}
          initial={
            editingAnnouncement
              ? (() => {
                  const target = parseAnnouncementScope(editingAnnouncement.target_scope);
                  return {
                    id: editingAnnouncement.id,
                    kind: editingAnnouncement.kind,
                    title: editingAnnouncement.title,
                    body: editingAnnouncement.body,
                    expires_at: editingAnnouncement.expires_at,
                    is_featured: editingAnnouncement.is_featured,
                    location_scope: target.locations,
                    department_scope: target.department_ids,
                    position_scope: target.position_ids,
                    user_scope: target.users,
                  };
                })()
              : undefined
          }
        />
      ) : null}
    </PageContent>
  );
}
