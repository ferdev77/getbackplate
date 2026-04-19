"use client";

import { useMemo, useState } from "react";
import { BellPlus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AnnouncementModalTrigger } from "@/modules/announcements/ui/announcement-modal-trigger";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { TooltipLabel } from "@/shared/ui/tooltip";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  kind: string | null;
  is_featured: boolean;
  publish_at: string | null;
  created_at: string;
  expires_at: string | null;
  created_by: string | null;
};

type Props = {
  visibleAnnouncements: AnnouncementRow[];
  myAnnouncements: AnnouncementRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
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

function kindLabel(kind: string | null) {
  if (kind === "urgent") return "Urgente";
  if (kind === "reminder") return "Recordatorio";
  if (kind === "celebration") return "Celebracion";
  return "General";
}

export function EmployeeAnnouncementsWorkspace({
  visibleAnnouncements,
  myAnnouncements,
  canCreate,
  canEdit,
  canDelete,
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

  const orderedFeed = useMemo(
    () =>
      [...feed].sort(
        (a, b) =>
          new Date(b.publish_at ?? b.created_at).getTime() - new Date(a.publish_at ?? a.created_at).getTime(),
      ),
    [feed],
  );

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
            onSubmitted={() => window.location.reload()}
          >
            <BellPlus className="h-3.5 w-3.5" /> Nuevo Aviso
          </AnnouncementModalTrigger>
        </section>
      ) : null}

      {(canEdit || canDelete) && mine.length > 0 ? (
        <section className="space-y-3">
          <p className="text-[11px] font-bold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Creados por mi</p>
          {mine.map((ann) => (
            <article key={ann.id} className="rounded-xl border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-5 py-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-bold text-[var(--gbp-text)]">{ann.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">
                    {ann.publish_at ? new Date(ann.publish_at).toLocaleDateString("es-AR") : "-"}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[11px] text-[var(--gbp-text2)]">
                  {kindLabel(ann.kind)}
                </span>
              </div>

              <p className="text-[13px] leading-6 text-[var(--gbp-text2)]">{ann.body}</p>

              <div className="mt-3 flex justify-end gap-1">
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
                    onSubmitted={() => window.location.reload()}
                    initial={{
                      id: ann.id,
                      kind: ann.kind ?? "general",
                      title: ann.title,
                      body: ann.body,
                      expires_at: ann.expires_at,
                      is_featured: ann.is_featured,
                      location_scope: [],
                      department_scope: [],
                      position_scope: [],
                      user_scope: [],
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
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <p className="text-[11px] font-bold tracking-[0.12em] text-[var(--gbp-muted)] uppercase">Asignados / visibles para mi</p>
        {orderedFeed.map((item) => (
          <article key={item.id} className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
            <p className="text-sm font-bold text-[var(--gbp-text)]">{item.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--gbp-text2)]">{item.body}</p>
          </article>
        ))}
        {!orderedFeed.length ? (
          <p className="rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-10 text-center text-sm text-[var(--gbp-text2)]">
            No hay avisos vigentes para tu perfil.
          </p>
        ) : null}
      </section>

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
