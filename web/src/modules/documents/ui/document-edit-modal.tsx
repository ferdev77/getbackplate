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
};

type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = ScopedUserOption;

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
  /** Intencion declarada por el selector; el servidor la valida (assertScopeIntent). */
  mode?: string;
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


export function DocumentEditModal({ document, folders, branches, departments, positions, users, busy, initialScope, onCancel, onSave }: Props) {
  const [title, setTitle] = useState(document.title);
  const [folderId, setFolderId] = useState(document.folder_id ?? "");
  const [scopeValid, setScopeValid] = useState(true);

  return (
    <ScopeModalDialog
      onClose={onCancel}
      overlayClassName="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5"
      panelClassName={SCOPE_MODAL_PANEL}
    >
        <ScopeModalHeader
          title="Editar documento"
          subtitle={document.title}
          onClose={onCancel}
        />
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
                mode: String(form.get("_scope_mode") ?? "") || undefined,
              };
            }
            onSave({ documentId: document.id, title: title.trim(), folderId: folderId || null, scope });
          }}
          className={SCOPE_MODAL_FORM}
        >
          <ScopeModalZones withScope={!folderId}>
            <ScopeModalContent withScope={!folderId}>
              <ScopeModalSection label="Datos del documento" />

              <ScopeModalField label="Título">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={SCOPE_MODAL_INPUT}
                  required
                  data-modal-initial-focus
                />
              </ScopeModalField>

              <ScopeModalField label="Carpeta">
                <select
                  value={folderId}
                  onChange={(event) => setFolderId(event.target.value)}
                  className={SCOPE_MODAL_SELECT}
                >
                  <option value="">Sin carpeta</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </ScopeModalField>

              <ScopeModalNote>
                {folderId
                  ? "El documento hereda los permisos de su carpeta. Editá la carpeta para cambiar quién accede."
                  : "El alcance de la derecha define quién puede abrirlo y descargarlo."}
              </ScopeModalNote>
            </ScopeModalContent>

            {!folderId ? (
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
                modeInputName="_scope_mode"
                question="¿Quién tiene que ver este documento?"
                audienceLabel="Tendrán acceso"
                onValidityChange={setScopeValid}
                initialLocations={initialScope.locations}
                initialDepartments={initialScope.departments}
                initialPositions={initialScope.positions}
                initialUsers={initialScope.users}
              />
            ) : null}
          </ScopeModalZones>
          <div className={SCOPE_MODAL_FOOTER}>
            <button type="button" onClick={onCancel} className={SCOPE_MODAL_CANCEL}>
              Cancelar
            </button>
            <SubmitButton
              label="Guardar cambios"
              pendingLabel="Guardando..."
              pending={busy}
              disabled={!title.trim() || !scopeValid}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
        </form>
    </ScopeModalDialog>
  );
}
