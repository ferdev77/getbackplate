"use client";

import { useState } from "react";
import type { PointerEventHandler } from "react";
import { Edit2, Trash2, ShieldAlert, ChevronDown, ChevronUp, Briefcase, GripVertical } from "lucide-react";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { InlinePositionForm } from "./inline-position-form";
import { ReorderablePositionList } from "./reorderable-position-list";

interface Position {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order?: number;
}

interface Department {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface EditableDepartmentItemProps {
  department: Department;
  positions: Position[];
  updateDepartmentAction: (formData: FormData) => Promise<void>;
  deleteDepartmentAction: (formData: FormData) => Promise<void>;
  toggleDepartmentStatusAction: (formData: FormData) => Promise<void>;
  createPositionAction: (formData: FormData) => Promise<void>;
  updatePositionAction: (formData: FormData) => Promise<void>;
  deletePositionAction: (formData: FormData) => Promise<void>;
  togglePositionStatusAction: (formData: FormData) => Promise<void>;
  dragHandleProps?: {
    onPointerDown?: PointerEventHandler;
  };
}

export function EditableDepartmentItem({
  department,
  positions,
  updateDepartmentAction,
  deleteDepartmentAction,
  toggleDepartmentStatusAction,
  createPositionAction,
  updatePositionAction,
  deletePositionAction,
  togglePositionStatusAction,
  dragHandleProps,
}: EditableDepartmentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Edit states
  const [name, setName] = useState(department.name);
  const [description, setDescription] = useState(department.description || "");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("department_id", department.id);
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      await updateDepartmentAction(formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update department", error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("department_id", department.id);
      await deleteDepartmentAction(formData);
      setIsDeleting(false);
    } catch (error) {
      console.error("Failed to delete department", error);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async () => {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("department_id", department.id);
      formData.append("next_status", department.is_active ? "inactive" : "active");
      await toggleDepartmentStatusAction(formData);
    } catch (error) {
      console.error("Failed to toggle department status", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] transition-all hover:border-[var(--gbp-border2)] ${!department.is_active ? "opacity-60" : ""}`}>
      {/* Header / Summary */}
      <div 
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => !isEditing && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-3">
          {dragHandleProps && (
            <div {...dragHandleProps} className="mt-2.5 -ml-1 mr-1 cursor-grab active:cursor-grabbing text-[var(--gbp-muted)] hover:text-[var(--gbp-text)] transition-colors">
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          <div className="mt-0.5 grid h-9 w-9 place-items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] text-[var(--gbp-text2)]">
            <Briefcase className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--gbp-text)]">{department.name}</h3>
              {!department.is_active && (
                <span className="rounded bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gbp-muted)]">
                  Inactivo
                </span>
              )}
            </div>
            <p className="line-clamp-1 text-xs text-[var(--gbp-text2)]">{department.description || "Sin descripción"}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[var(--gbp-muted)]">
              {positions.length} {positions.length === 1 ? "Puesto" : "Puestos"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setIsEditing(true)}
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
              title="Editar departamento"
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={handleToggleStatus}
              disabled={busy}
              className={`grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-[var(--gbp-surface2)] ${department.is_active ? "text-[var(--gbp-muted)] hover:text-orange-500" : "text-orange-500 hover:text-orange-600"}`}
              title={department.is_active ? "Desactivar" : "Activar"}
            >
              <ShieldAlert className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsDeleting(true)}
              className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-error-soft)] hover:text-[var(--gbp-error)]"
              title="Eliminar departamento"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="ml-2 border-l border-[var(--gbp-border)] pl-3">
             {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--gbp-muted)]" /> : <ChevronDown className="h-4 w-4 text-[var(--gbp-muted)]" />}
          </div>
        </div>
      </div>

      {/* Edit Form (Department) */}
      {isEditing && (
        <div className="border-t border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
          <form onSubmit={handleUpdate} className="grid gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-widest text-[var(--gbp-muted)]">Editando Departamento</p>
              <button type="button" onClick={() => setIsEditing(false)} className="text-[var(--gbp-muted)] hover:text-[var(--gbp-text)]">✕</button>
            </div>
            <input
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre de departamento"
              className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
              disabled={busy}
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción"
              className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
              disabled={busy}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={busy}
                className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-4 py-2 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="rounded-lg bg-[var(--gbp-text)] px-4 py-2 text-xs font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-50"
              >
                {busy ? "Guardando..." : "Guardar cambios"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Expanded Content (Positions) */}
      {isExpanded && !isEditing && (
        <div className="border-t border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 animate-in fade-in slide-in-from-top-2">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--gbp-muted)]">Puestos de Trabajo</p>
            <InlinePositionForm 
              departmentId={department.id} 
              departmentName={department.name} 
              createAction={createPositionAction} 
            />
          </div>

          <div className="space-y-1">
            <ReorderablePositionList
              departmentId={department.id}
              initialPositions={positions}
              updateAction={updatePositionAction}
              deleteAction={deletePositionAction}
              toggleStatusAction={togglePositionStatusAction}
            />
          </div>
        </div>
      )}

      {isDeleting && (
        <ConfirmDeleteDialog
          title={`Eliminar departamento: ${department.name}`}
          description="¿Estás seguro de eliminar este departamento? Se eliminará permanentemente si no tiene puestos asociados ni personal asignado."
          busy={busy}
          onCancel={() => setIsDeleting(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
