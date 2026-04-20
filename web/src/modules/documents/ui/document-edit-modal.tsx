"use client";

import { useState } from "react";

import { ScopeSelector } from "@/shared/ui/scope-selector";

type FolderRow = {
  id: string;
  name: string;
};

type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type DocumentInput = {
  id: string;
  title: string;
  folder_id: string | null;
};

type ScopeState = {
  locations: string[];
  departments: string[];
  positions: string[];
  users: string[];
};

type Props = {
  document: DocumentInput;
  folders: FolderRow[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
  busy: boolean;
  initialScope: ScopeState;
  onCancel: () => void;
  onSave: (payload: { documentId: string; title: string; folderId: string | null; scope?: ScopeState }) => void;
};

const MODAL_PANEL = "overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]";
const MODAL_HEADER = "flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5";
const MODAL_TITLE = "font-serif text-[15px] font-bold text-[var(--gbp-text)]";
const MODAL_CLOSE = "grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-bg)]";
const MODAL_SOFT_BOX = "rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3";
const MODAL_LABEL = "text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-text2)] uppercase";
const MODAL_INPUT = "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]";
const MODAL_FOOTER = "flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4";
const MODAL_CANCEL = "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const MODAL_PRIMARY = "rounded-lg bg-[var(--gbp-text)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-60";

export function DocumentEditModal({ document, folders, branches, departments, positions, users, busy, initialScope, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(document.title);
  const [folderId, setFolderId] = useState(document.folder_id ?? "");

  return (
    <div className="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5">
      <div className={`w-[700px] max-w-[95vw] ${MODAL_PANEL}`}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>Editar Documento</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            let scope = undefined;
            if (!folderId) {
              const toList = (key: string) => [...new Set(form.getAll(key).map((value) => String(value).trim()).filter(Boolean))];
              scope = {
                locations: toList("_scope_location"),
                departments: toList("_scope_department"),
                positions: toList("_scope_position"),
                users: toList("_scope_user"),
              };
            }
            onSave({ documentId: document.id, title: title.trim(), folderId: folderId || null, scope });
          }}
        >
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
            <section className={MODAL_SOFT_BOX}>
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-text2)]">Datos del documento</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className={MODAL_LABEL}>Titulo</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className={MODAL_INPUT} required />
                </label>
                <label className="grid gap-1.5">
                  <span className={MODAL_LABEL}>Carpeta</span>
                  <select value={folderId} onChange={(event) => setFolderId(event.target.value)} className={MODAL_INPUT}>
                    <option value="">Sin carpeta</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {!folderId ? (
              <section className={MODAL_SOFT_BOX}>
                <div className="mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-text2)]">Permisos de acceso</p>
                  <p className="mt-1 text-xs text-[var(--gbp-text2)]">Define alcance por ubicación, departamento, puesto o usuario.</p>
                </div>
                <div className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 pb-3">
                  <ScopeSelector
                    namespace="edit-document"
                    branches={branches}
                    departments={departments}
                    positions={positions}
                    users={users}
                    locationInputName="_scope_location"
                    departmentInputName="_scope_department"
                    positionInputName="_scope_position"
                    userInputName="_scope_user"
                    initialLocations={initialScope.locations}
                    initialDepartments={initialScope.departments}
                    initialPositions={initialScope.positions}
                    initialUsers={initialScope.users}
                  />
                </div>
              </section>
            ) : (
              <section className="rounded-lg border border-amber-300/50 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                El documento hereda permisos de su carpeta. Edita la carpeta para cambiar acceso.
              </section>
            )}
          </div>
          <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="submit" disabled={busy || !title.trim()} className={MODAL_PRIMARY}>{busy ? "Guardando..." : "Guardar"}</button></div>
        </form>
      </div>
    </div>
  );
}
