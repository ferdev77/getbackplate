"use client";

import { useEffect, useState } from "react";

import { ScopeSelector } from "@/shared/ui/scope-selector";

type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type ScopeState = { locations: string[]; departments: string[]; positions: string[]; users: string[] };

type Props = {
  title: string;
  itemName: string;
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
  initialScope: ScopeState;
  busy: boolean;
  onCancel: () => void;
  onSave: (scope: ScopeState) => void;
};

const MODAL_PANEL = "overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]";
const MODAL_HEADER = "flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5";
const MODAL_TITLE = "font-serif text-sm font-bold text-[var(--gbp-text)]";
const MODAL_CLOSE = "grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-bg)]";
const MODAL_SOFT_BOX = "rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3";
const MODAL_FOOTER = "flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4";
const MODAL_CANCEL = "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const MODAL_PRIMARY = "rounded-lg bg-[var(--gbp-text)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-60";

export function DocumentShareAccessModal({
  title,
  itemName,
  branches,
  departments,
  positions,
  users,
  initialScope,
  busy,
  onCancel,
  onSave,
}: Props) {
  const scopeFormId = `share-scope-form-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const [dynamicUsers, setDynamicUsers] = useState<User[]>(users);
  const [dynamicPositions, setDynamicPositions] = useState<Position[]>(positions);
  const [loading, setLoading] = useState(users.length === 0 || positions.length === 0);

  useEffect(() => {
    if (users.length === 0 || positions.length === 0) {
      fetch("/api/company/documents?catalog=share_scopes")
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(typeof data.error === "string" ? data.error : "No se pudieron cargar los permisos");
          }

          setDynamicUsers(Array.isArray(data.employees) ? data.employees : []);
          setDynamicPositions(Array.isArray(data.positions) ? data.positions : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [users.length, positions.length]);

  return (
    <div className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/45 p-5">
      <div className={`w-[460px] max-w-[95vw] ${MODAL_PANEL}`}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>{title}</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <form
          id={scopeFormId}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const toList = (key: string) => [...new Set(form.getAll(key).map((value) => String(value).trim()).filter(Boolean))];
            onSave({
              locations: toList("_scope_location"),
              departments: toList("_scope_department"),
              positions: toList("_scope_position"),
              users: toList("_scope_user"),
            });
          }}
        >
          <div className="max-h-[68vh] overflow-y-auto px-6 py-4">
            <div className={MODAL_SOFT_BOX}>
              <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[var(--gbp-text2)] uppercase">Elemento</p>
              <p className="text-sm font-semibold text-[var(--gbp-text)]">{itemName}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <span className="animate-pulse text-xs font-semibold text-[var(--gbp-text2)]">Cargando permisos...</span>
              </div>
            ) : (
              <ScopeSelector
                namespace={`share-${title.toLowerCase().replace(/\s+/g, "-")}`}
                branches={branches}
                departments={departments}
                positions={dynamicPositions}
                users={dynamicUsers}
                locationInputName="_scope_location"
                departmentInputName="_scope_department"
                positionInputName="_scope_position"
                userInputName="_scope_user"
                initialLocations={initialScope.locations}
                initialDepartments={initialScope.departments}
                initialPositions={initialScope.positions}
                initialUsers={initialScope.users}
              />
            )}
          </div>
          <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="submit" disabled={busy} className={MODAL_PRIMARY}>{busy ? "Guardando..." : "Guardar permisos"}</button></div>
        </form>
      </div>
    </div>
  );
}
