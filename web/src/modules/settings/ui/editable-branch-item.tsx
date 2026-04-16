"use client";

import { useState } from "react";
import type { PointerEventHandler } from "react";
import { Edit2, Trash2, MapPin, ShieldAlert, GripVertical } from "lucide-react";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";

interface Branch {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  phone: string | null;
  is_active: boolean;
}

interface EditableBranchItemProps {
  branch: Branch;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  toggleStatusAction: (formData: FormData) => Promise<void>;
  dragHandleProps?: {
    onPointerDown?: PointerEventHandler;
  };
}

export function EditableBranchItem({
  branch,
  updateAction,
  deleteAction,
  toggleStatusAction,
  dragHandleProps,
}: EditableBranchItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  // Edit states
  const [name, setName] = useState(branch.name);
  const [city, setCity] = useState(branch.city || "");
  const [state, setState] = useState(branch.state || "");
  const [country, setCountry] = useState(branch.country || "");
  const [address, setAddress] = useState(branch.address || "");
  const [phone, setPhone] = useState(branch.phone || "");

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("branch_id", branch.id);
      formData.append("name", name.trim());
      formData.append("city", city.trim());
      formData.append("state", state.trim());
      formData.append("country", country.trim());
      formData.append("address", address.trim());
      formData.append("phone", phone.trim());
      await updateAction(formData);
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update branch", error);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("branch_id", branch.id);
      await deleteAction(formData);
      setIsDeleting(false);
    } catch (error) {
      console.error("Failed to delete branch", error);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleStatus = async () => {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("branch_id", branch.id);
      formData.append("next_status", branch.is_active ? "inactive" : "active");
      await toggleStatusAction(formData);
    } catch (error) {
      console.error("Failed to toggle branch status", error);
    } finally {
      setBusy(false);
    }
  };

  if (isEditing) {
    return (
      <form
        onSubmit={handleUpdate}
        className="animate-in fade-in slide-in-from-top-2 space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4 shadow-sm"
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-[var(--gbp-text)]">Editar Locación</p>
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="grid h-6 w-6 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-surface2)]"
          >
            ✕
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            name="name"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de locación"
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
            disabled={busy}
          />
          <input
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ciudad"
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
            disabled={busy}
          />
          <input
            name="state"
            value={state}
            onChange={(e) => setState(e.target.value)}
            placeholder="Estado"
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
            disabled={busy}
          />
          <input
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="País"
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)]"
            disabled={busy}
          />
          <input
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Teléfono"
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)] sm:col-span-2"
            disabled={busy}
          />
          <input
            name="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Dirección"
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-accent)] sm:col-span-2"
            disabled={busy}
          />
        </div>
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
    );
  }

  const locationStr = [branch.city, branch.state, branch.country].filter(Boolean).join(", ");

  return (
    <div className={`group relative flex items-center justify-between rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 transition-all hover:border-[var(--gbp-border2)] hover:shadow-sm ${!branch.is_active ? "opacity-60" : ""}`}>
      <div className="flex items-start gap-3">
        {dragHandleProps && (
          <div {...dragHandleProps} className="mt-1 -ml-1 mr-1 cursor-grab active:cursor-grabbing text-[var(--gbp-muted)] hover:text-[var(--gbp-text)] transition-colors">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className={`mt-0.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-bg)] p-2 text-[var(--gbp-text2)]`}>
          <MapPin className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--gbp-text)]">{branch.name}</h3>
            {!branch.is_active && (
              <span className="rounded bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gbp-muted)]">
                Inactiva
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--gbp-text2)]">{locationStr || "Sin ubicación definida"}</p>
          {branch.phone && <p className="mt-0.5 text-[11px] text-[var(--gbp-muted)]">{branch.phone}</p>}
        </div>
      </div>

      <div className="flex items-center gap-1 transition-opacity">
        <button
          onClick={() => setIsEditing(true)}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          title="Editar"
        >
          <Edit2 className="h-4 w-4" />
        </button>
        <button
          onClick={handleToggleStatus}
          disabled={busy}
          className={`grid h-8 w-8 place-items-center rounded-md transition-colors hover:bg-[var(--gbp-surface2)] ${branch.is_active ? "text-[var(--gbp-muted)] hover:text-orange-500" : "text-orange-500 hover:text-orange-600"}`}
          title={branch.is_active ? "Desactivar" : "Activar"}
        >
          <ShieldAlert className="h-4 w-4" />
        </button>
        <button
          onClick={() => setIsDeleting(true)}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-error-soft)] hover:text-[var(--gbp-error)]"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {isDeleting && (
        <ConfirmDeleteDialog
          title={`Eliminar locación: ${branch.name}`}
          description="¿Estás seguro de que deseas eliminar esta locación permanentemente? Solo se podrá eliminar si no tiene personal asignado."
          busy={busy}
          onCancel={() => setIsDeleting(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
