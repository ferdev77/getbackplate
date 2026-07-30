"use client";

import { useEffect, useState } from "react";

import { ScopeSelector } from "@/shared/ui/scope-selector";
import {
  ScopeModalContent,
  ScopeModalNote,
  ScopeModalSection,
  ScopeModalZones,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_HEADER,
  SCOPE_MODAL_PANEL,
} from "@/shared/ui/scope-modal-layout";
import type { ScopedUserOption } from "@/shared/contracts/scope-options";

type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = ScopedUserOption;

type ScopeState = {
  locations: string[];
  departments: string[];
  positions: string[];
  users: string[];
  /** Intencion declarada por el selector; el servidor la valida (assertScopeIntent). */
  mode?: string;
};

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

const MODAL_TITLE = "font-serif text-sm font-bold text-[var(--gbp-text)]";
const MODAL_CLOSE = "grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-bg)]";
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
  const [scopeValid, setScopeValid] = useState(true);

  useEffect(() => {
    if (users.length === 0 || positions.length === 0) {
      fetch("/api/company/documents?catalog=share_scopes")
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(typeof data.error === "string" ? data.error : "Could not load permissions");
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
      <div className={SCOPE_MODAL_PANEL}>
        <div className={SCOPE_MODAL_HEADER}><p className={MODAL_TITLE}>{title}</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
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
              mode: String(form.get("_scope_mode") ?? "") || undefined,
            });
          }}
          className={SCOPE_MODAL_FORM}
        >
          <ScopeModalZones withScope={!loading}>
            <ScopeModalContent withScope={!loading}>
              <ScopeModalSection label="Documento" />
              <p className="shrink-0 rounded-[9px] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-[11px] py-[9px] text-[13px] font-semibold text-[var(--gbp-text)]">
                {itemName}
              </p>

              <ScopeModalNote>
                Lo que definas a la derecha reemplaza el acceso actual.
              </ScopeModalNote>

              {loading ? (
                <p className="shrink-0 text-[11.5px] text-[var(--gbp-text2)]">Cargando permisos…</p>
              ) : null}
            </ScopeModalContent>

            {!loading ? (
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
                modeInputName="_scope_mode"
                question="¿Quién tiene que acceder?"
                audienceLabel="Tendrán acceso"
                onValidityChange={setScopeValid}
                initialLocations={initialScope.locations}
                initialDepartments={initialScope.departments}
                initialPositions={initialScope.positions}
                initialUsers={initialScope.users}
              />
            ) : null}
          </ScopeModalZones>
          <div className={SCOPE_MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancel</button><button type="submit" disabled={busy || !scopeValid} className={MODAL_PRIMARY}>{busy ? "Saving..." : "Save permissions"}</button></div>
        </form>
      </div>
    </div>
  );
}
