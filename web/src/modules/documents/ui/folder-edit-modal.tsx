"use client";

import { useState } from "react";

import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";
import {
  ScopeModalContent,
  ScopeModalDialog,
  ScopeModalHeader,
  ScopeModalField,
  ScopeModalNote,
  ScopeModalSection,
  SCOPE_MODAL_INPUT,
  SCOPE_MODAL_SELECT,
  ScopeModalZones,
  SCOPE_MODAL_CANCEL,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_PANEL,
} from "@/shared/ui/scope-modal-layout";
import type { ScopedUserOption } from "@/shared/contracts/scope-options";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

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
  folder: FolderRow;
  folders: FolderRow[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
  busy: boolean;
  initialScope: ScopeState;
  onCancel: () => void;
  onSave: (payload: { folderId: string; name: string; parentId: string | null; scope?: ScopeState }) => void;
};


export function FolderEditModal({ folder, folders, branches, departments, positions, users, busy, initialScope, onCancel, onSave }: Props) {
  const [name, setName] = useState(folder.name);
  const [parentId, setParentId] = useState(folder.parent_id ?? "");
  const [scopeValid, setScopeValid] = useState(true);

  return (
    <ScopeModalDialog
      onClose={onCancel}
      overlayClassName="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5"
      panelClassName={SCOPE_MODAL_PANEL}
    >
        <ScopeModalHeader
          title="Editar carpeta"
          subtitle="Lo que guardes adentro hereda este alcance si no tiene uno propio"
          onClose={onCancel}
        />
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const toList = (key: string) => [...new Set(form.getAll(key).map((value) => String(value).trim()).filter(Boolean))];
            const scope = {
              locations: toList("_scope_location"),
              departments: toList("_scope_department"),
              positions: toList("_scope_position"),
              users: toList("_scope_user"),
              mode: String(form.get("_scope_mode") ?? "") || undefined,
            };
            onSave({ folderId: folder.id, name: name.trim(), parentId: parentId || null, scope });
          }}
          className={SCOPE_MODAL_FORM}
        >
          <ScopeModalZones>
            <ScopeModalContent>
              <ScopeModalSection label="Datos de la carpeta" />

              <ScopeModalField label="Nombre">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className={SCOPE_MODAL_INPUT}
                  required
                  data-modal-initial-focus
                />
              </ScopeModalField>

              <ScopeModalField label="Carpeta padre">
                <select
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                  className={SCOPE_MODAL_SELECT}
                >
                  <option value="">Sin carpeta</option>
                  {folders
                    .filter((row) => row.id !== folder.id)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                </select>
              </ScopeModalField>

              <ScopeModalNote>
                Los documentos guardados aquí que no tengan alcance propio usan el de esta carpeta.
              </ScopeModalNote>
            </ScopeModalContent>

            <ScopeSelector
                  namespace="edit-folder"
                  branches={branches}
                  departments={departments}
                  positions={positions}
                  users={users}
                  locationInputName="_scope_location"
                  departmentInputName="_scope_department"
                  positionInputName="_scope_position"
                  userInputName="_scope_user"
                  modeInputName="_scope_mode"
                  question="¿Quién tiene que acceder a esta carpeta?"
                  audienceLabel="Tendrán acceso"
                  onValidityChange={setScopeValid}
                  initialLocations={initialScope.locations}
                  initialDepartments={initialScope.departments}
                  initialPositions={initialScope.positions}
                  initialUsers={initialScope.users}
              />
          </ScopeModalZones>
          <div className={SCOPE_MODAL_FOOTER}>
            <button type="button" onClick={onCancel} className={SCOPE_MODAL_CANCEL}>
              Cancelar
            </button>
            <SubmitButton
              label="Guardar cambios"
              pendingLabel="Guardando..."
              pending={busy}
              disabled={!name.trim() || !scopeValid}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
        </form>
    </ScopeModalDialog>
  );
}
