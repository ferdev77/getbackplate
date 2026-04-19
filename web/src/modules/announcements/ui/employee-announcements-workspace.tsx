"use client";

import { useMemo, useState } from "react";
import { BellPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AnnouncementModalTrigger } from "@/modules/announcements/ui/announcement-modal-trigger";
import { AnnouncementCard } from "@/modules/announcements/ui/announcement-card";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { TooltipLabel } from "@/shared/ui/tooltip";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { AssignedCreatedToggle } from "@/shared/ui/assigned-created-toggle";
import { parseAnnouncementScope } from "@/modules/announcements/lib/scope";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  kind: string | null;
  is_featured: boolean;
  publish_at: string | null;
  created_at: string;
  expires_at: string | null;
  target_scope: unknown;
  created_by: string | null;
  created_by_name?: string;
};

type Props = {
  visibleAnnouncements: AnnouncementRow[];
  myAnnouncements: AnnouncementRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  viewerUserId: string;
  publisherName: string;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
};

const ACTION_BTN_NEUTRAL =
  "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_DANGER =
  "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)]";

function announcementSortScore(row: { is_featured: boolean; publish_at: string | null; created_at: string }) {
  return new Date(row.publish_at ?? row.created_at).getTime();
}

function sortAnnouncements(rows: AnnouncementRow[]) {
  return [...rows].sort((a, b) => {
    if (Boolean(a.is_featured) !== Boolean(b.is_featured)) {
      return a.is_featured ? -1 : 1;
    }
    return announcementSortScore(b) - announcementSortScore(a);
  });
}

export function EmployeeAnnouncementsWorkspace({
  visibleAnnouncements,
  myAnnouncements,
  canCreate,
  canEdit,
  canDelete,
  viewerUserId,
  publisherName,
  branches,
  departments,
  positions,
  users,
}: Props) {
  const [feed, setFeed] = useState<AnnouncementRow[]>(visibleAnnouncements);
  const [mine, setMine] = useState<AnnouncementRow[]>(myAnnouncements);
  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [viewMode, setViewMode] = useState<"assigned" | "created">("assigned");

  const branchNameMap = useMemo(() => new Map(branches.map((row) => [row.id, row.name])), [branches]);
  const departmentNameMap = useMemo(() => new Map(departments.map((row) => [row.id, row.name])), [departments]);
  const positionNameMap = useMemo(() => new Map(positions.map((row) => [row.id, row.name])), [positions]);
  const today = new Date().toISOString().slice(0, 10);

  const orderedFeed = useMemo(
    () => sortAnnouncements(feed),
    [feed],
  );

  const assignedFeed = useMemo(
    () => orderedFeed.filter((row) => row.created_by !== viewerUserId && !mine.some((created) => created.id === row.id)),
    [mine, orderedFeed, viewerUserId],
  );

  const mineResolved = useMemo(() => {
    const merged = new Map<string, AnnouncementRow>();
    for (const row of mine) merged.set(row.id, row);
    for (const row of orderedFeed) {
      if (row.created_by === viewerUserId) {
        merged.set(row.id, row);
      }
    }
    return sortAnnouncements([...merged.values()]);
  }, [mine, orderedFeed, viewerUserId]);

  async function removeAnnouncement(announcementId: string) {
    setBusyDelete(true);
    try {
      const response = await fetch("/api/employee/announcements/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ announcementId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar aviso");

      setMine((prev) => prev.filter((row) => row.id !== announcementId));
      setFeed((prev) => prev.filter((row) => row.id !== announcementId));
      setDeleteTarget(null);
      toast.success("Aviso eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo eliminar aviso");
    } finally {
      setBusyDelete(false);
    }
  }

  function upsertAnnouncement(payload: {
    mode: "create" | "edit";
    announcement: {
      id: string;
      title: string;
      body: string;
      kind: string | null;
      is_featured: boolean;
      publish_at: string | null;
      created_at: string;
      expires_at: string | null;
      target_scope: {
        locations: string[];
        department_ids: string[];
        position_ids: string[];
        users: string[];
      };
      created_by: string | null;
      created_by_name?: string;
    };
  }) {
    const nextRow: AnnouncementRow = {
      id: payload.announcement.id,
      title: payload.announcement.title,
      body: payload.announcement.body,
      kind: payload.announcement.kind,
      is_featured: payload.announcement.is_featured,
      publish_at: payload.announcement.publish_at,
      created_at: payload.announcement.created_at,
      expires_at: payload.announcement.expires_at,
      target_scope: payload.announcement.target_scope,
      created_by: payload.announcement.created_by ?? viewerUserId,
      created_by_name: payload.announcement.created_by_name ?? publisherName,
    };

    setFeed((prev) => {
      const index = prev.findIndex((row) => row.id === nextRow.id);
      if (index < 0) return [nextRow, ...prev];
      const copy = [...prev];
      copy[index] = { ...copy[index], ...nextRow };
      return copy;
    });

    if ((nextRow.created_by ?? viewerUserId) === viewerUserId) {
      setMine((prev) => {
        const index = prev.findIndex((row) => row.id === nextRow.id);
        if (index < 0) return [nextRow, ...prev];
        const copy = [...prev];
        copy[index] = { ...copy[index], ...nextRow };
        return copy;
      });
    }
  }

  return (
    <div className="space-y-6">
      {canCreate ? (
        <section className="flex justify-end">
          <AnnouncementModalTrigger
            className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white hover:bg-[var(--gbp-accent)]"
            mode="create"
            publisherName={publisherName}
            branches={branches}
            departments={departments}
            positions={positions}
            users={users}
            submitEndpoint="/api/employee/announcements/manage"
            basePath="/portal/announcements"
            onSubmitted={(payload) => {
              if (payload) upsertAnnouncement(payload);
            }}
          >
            <BellPlus className="h-3.5 w-3.5" /> Nuevo Aviso
          </AnnouncementModalTrigger>
        </section>
      ) : null}

      <AssignedCreatedToggle viewMode={viewMode} onChange={setViewMode} />

      {viewMode === "created" && mineResolved.length > 0 ? (
        <section className="space-y-3">
          <p className="text-[11px] font-bold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Creados por mi</p>
          {mineResolved.map((ann) => {
            const target = parseAnnouncementScope(ann.target_scope);
            return (
              <AnnouncementCard
                key={ann.id}
                announcement={ann}
                authorName={ann.created_by_name ?? "Dirección"}
                todayIso={today}
                branchNameMap={branchNameMap}
                departmentNameMap={departmentNameMap}
                positionNameMap={positionNameMap}
                actions={(
                  <>
                    {canEdit ? (
                      <AnnouncementModalTrigger
                        className={ACTION_BTN_NEUTRAL}
                        mode="edit"
                        publisherName={publisherName}
                        branches={branches}
                        departments={departments}
                        positions={positions}
                        users={users}
                        submitEndpoint="/api/employee/announcements/manage"
                        basePath="/portal/announcements"
                        onSubmitted={(payload) => {
                          if (payload) upsertAnnouncement(payload);
                        }}
                        initial={{
                          id: ann.id,
                          kind: ann.kind ?? "general",
                          title: ann.title,
                          body: ann.body,
                          expires_at: ann.expires_at,
                          is_featured: ann.is_featured,
                          location_scope: target.locations,
                          department_scope: target.department_ids,
                          position_scope: target.position_ids,
                          user_scope: target.users,
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <TooltipLabel label="Editar" />
                      </AnnouncementModalTrigger>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        className={ACTION_BTN_DANGER}
                        onClick={() => setDeleteTarget(ann)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <TooltipLabel label="Eliminar" />
                      </button>
                    ) : null}
                  </>
                )}
              />
            );
          })}
        </section>
      ) : null}

      {viewMode === "assigned" ? (
      <section className="space-y-3">
        <p className="text-[11px] font-bold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Asignados / visibles para mi</p>
        {assignedFeed.map((item) => (
          <AnnouncementCard
            key={item.id}
            announcement={item}
            authorName={item.created_by_name ?? "Dirección"}
            todayIso={today}
            branchNameMap={branchNameMap}
            departmentNameMap={departmentNameMap}
            positionNameMap={positionNameMap}
          />
        ))}
        {!assignedFeed.length ? (
          <p className="rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-10 text-center text-sm text-[var(--gbp-text2)]">
            No hay avisos vigentes para tu perfil.
          </p>
        ) : null}
      </section>
      ) : mineResolved.length === 0 ? (
        <section className="space-y-3">
          <p className="text-[11px] font-bold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Creados por mi</p>
          <p className="rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-10 text-center text-sm text-[var(--gbp-text2)]">
            Aun no creaste avisos.
          </p>
        </section>
      ) : null}

      {deleteTarget ? (
        <ConfirmDeleteDialog
          title="Eliminar aviso"
          description={`Se eliminará \"${deleteTarget.title}\". Esta acción no se puede deshacer.`}
          busy={busyDelete}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void removeAnnouncement(deleteTarget.id)}
          confirmLabel="Eliminar"
        />
      ) : null}
    </div>
  );
}
