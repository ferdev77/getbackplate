"use client";

import { useState } from "react";
import { Edit2, Trash2, Check, X, ShieldAlert, GripVertical } from "lucide-react";
import type { PointerEventHandler } from "react";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";

interface Position {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface EditablePositionItemProps {
  position: Position;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleStatusAction: (formData: FormData) => Promise<void>;
  dragHandleProps?: {
    onPointerDown?: PointerEventHandler;
  };
}

export function EditablePositionItem({
  position,
  updateAction,
  deleteAction,
  toggleStatusAction,
  dragHandleProps,
}: EditablePositionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit states
  const [name, setName] = useState(position.name);
  const [description, setDescription] = useState(position.description || "");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("position_id", position.id);
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      await updateAction(formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update position", error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("position_id", position.id);
      await deleteAction(formData);
      setIsDeleting(false);
    } catch (error) {
      console.error("Failed to delete position", error);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async () => {
    setBusy(true);
    setIsToggling(true);
    try {
      const formData = new FormData();
      formData.append("position_id", position.id);
      formData.append("next_status", position.is_active ? "inactive" : "active");
      await toggleStatusAction(formData);
    } catch (error) {
      console.error("Failed to toggle status", error);
    } finally {
      setBusy(false);
      setIsToggling(false);
    }
  };

  if (isEditing) {
    return (
      <form
        onSubmit={handleUpdate}
        className="flex animate-in fade-in slide-in-from-left-2 items-center gap-2 py-1.5"
      >
        <div className="flex-1 space-y-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del puesto"
            className="w-full rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1.5 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
            disabled={busy}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            className="w-full rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1.5 text-xs text-[var(--gbp-text2)] outline-none focus:border-[var(--gbp-accent)]"
            disabled={busy}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="grid h-8 w-8 place-items-center rounded-md bg-[var(--gbp-text)] text-white hover:bg-[var(--gbp-accent)] disabled:opacity-50"
          >
            {busy ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            disabled={busy}
            className="grid h-8 w-8 place-items-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`group flex items-center justify-between rounded-lg border border-transparent px-2 py-1.5 transition-all hover:border-[var(--gbp-border2)] hover:bg-[var(--gbp-surface)] ${!position.is_active ? "opacity-60" : ""}`}>
      <div className="flex flex-1 items-center gap-2">
        {dragHandleProps && (
          <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing text-[var(--gbp-muted)] hover:text-[var(--gbp-text)] transition-colors">
            <GripVertical className="h-3.5 w-3.5" />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-[var(--gbp-text)]">{position.name}</span>
          {!position.is_active && (
            <span className="rounded bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gbp-muted)]">
              Inactivo
            </span>
          )}
        </div>
        {position.description && (
          <p className="line-clamp-1 text-[12px] text-[var(--gbp-text2)]">{position.description}</p>
        )}
        </div>
      </div>

      <div className="flex items-center gap-1 transition-opacity">
        <button
          onClick={() => setIsEditing(true)}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          title="Editar"
        >
          <Edit2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={handleToggleStatus}
          disabled={isToggling}
          className={`grid h-7 w-7 place-items-center rounded-md transition-colors hover:bg-[var(--gbp-surface2)] ${position.is_active ? "text-[var(--gbp-muted)] hover:text-orange-500" : "text-orange-500 hover:text-orange-600"}`}
          title={position.is_active ? "Desactivar" : "Activar"}
        >
          {isToggling ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <ShieldAlert className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={() => setIsDeleting(true)}
          className="grid h-7 w-7 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-error-soft)] hover:text-[var(--gbp-error)]"
          title="Eliminar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {isDeleting && (
        <ConfirmDeleteDialog
          title={`Eliminar puesto: ${position.name}`}
          description="¿Estás seguro de eliminar este puesto? Esta acción no se puede deshacer si no está en uso."
          busy={busy}
          onCancel={() => setIsDeleting(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
