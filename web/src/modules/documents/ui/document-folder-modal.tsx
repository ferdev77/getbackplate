"use client";

import { type FormEvent, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import {
  ScopeModalContent,
  ScopeModalHeader,
  ScopeModalField,
  ScopeModalNote,
  ScopeModalSection,
  SCOPE_MODAL_INPUT,
  SCOPE_MODAL_SELECT,
  ScopeModalZones,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_PANEL,
} from "@/shared/ui/scope-modal-layout";
import { SubmitButton } from "@/shared/ui/submit-button";
import type { ScopedUserOption } from "@/shared/contracts/scope-options";

type Folder = { id: string; name: string };
type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type Employee = ScopedUserOption;

type DocumentFolderModalProps = {
  onClose?: () => void;
  onCreated?: () => void;
  folders: Folder[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  submitEndpoint?: string;
  redirectPath?: string;
  hideScopeSelector?: boolean;
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
};

export function DocumentFolderModal({
  onClose,
  onCreated,
  folders,
  branches,
  departments,
  positions,
  employees,
  submitEndpoint = "/api/company/document-folders",
  redirectPath = "/app/documents",
  hideScopeSelector = false,
  allowedLocationIds,
  lockLocationSelection = false,
}: DocumentFolderModalProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [scopeValid, setScopeValid] = useState(true);

  const closeModal = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push(redirectPath);
  };

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setIsPending(true);
    try {
      const formData = new FormData(event.currentTarget);
      const payload = {
        name: String(formData.get("name") ?? "").trim(),
        parentId: String(formData.get("parent_id") ?? "").trim() || null,
        locationScope: formData.getAll("location_scope").map(String).filter(Boolean),
        departmentScope: formData.getAll("department_scope").map(String).filter(Boolean),
        positionScope: formData.getAll("position_scope").map(String).filter(Boolean),
        userScope: formData.getAll("user_scope").map(String).filter(Boolean),
        scopeMode: String(formData.get("scope_mode") ?? "").trim() || undefined,
      };

      const body = hideScopeSelector
        ? { name: payload.name, parentId: payload.parentId }
        : payload;

      const response = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error("No se pudo crear la carpeta.");
      }

      toast.success("Carpeta creada.");
      startTransition(() => {
        if (onClose) {
          onClose();
        } else {
          router.push(redirectPath);
        }
        onCreated?.();
        router.refresh();
      });
    } catch {
      toast.error("No se pudo crear la carpeta.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className={SCOPE_MODAL_PANEL}>
        <ScopeModalHeader
          title="Crear carpeta"
          subtitle="Lo que guardes adentro hereda este alcance si no tiene uno propio"
          onClose={closeModal}
        />
        <form onSubmit={onSubmit} className={SCOPE_MODAL_FORM}>
          <ScopeModalZones withScope={!hideScopeSelector}>
            <ScopeModalContent withScope={!hideScopeSelector}>
              <ScopeModalSection label="Datos de la carpeta" />

              <ScopeModalField label="Nombre">
                <input name="name" required className={SCOPE_MODAL_INPUT} placeholder="ej. Manuales, Operaciones" />
              </ScopeModalField>

              <ScopeModalField label="Carpeta padre">
                <select name="parent_id" defaultValue="" className={SCOPE_MODAL_SELECT}>
                  <option value="">Sin carpeta</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </ScopeModalField>

              <ScopeModalNote>
                Los documentos que se guarden acá sin alcance propio usarán el de esta carpeta.
              </ScopeModalNote>
            </ScopeModalContent>

            {!hideScopeSelector ? (
              <ScopeSelector
                    namespace="folder"
                    branches={branches}
                    departments={departments}
                    positions={positions}
                    users={employees}
                    locationInputName="location_scope"
                    departmentInputName="department_scope"
                    positionInputName="position_scope"
                    userInputName="user_scope"
                    modeInputName="scope_mode"
                    question="¿Quién tiene que acceder a esta carpeta?"
                    audienceLabel="Tendrán acceso"
                    onValidityChange={setScopeValid}
                    allowedLocationIds={allowedLocationIds}
                    lockLocationSelection={lockLocationSelection}
                    locationHelperText={lockLocationSelection ? "Tu alcance base queda limitado a tus locaciones asignadas." : undefined}
              />
            ) : null}
          </ScopeModalZones>
          <div className={SCOPE_MODAL_FOOTER}>
            <button type="button" onClick={closeModal} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</button>
            <SubmitButton 
              label="Crear Carpeta" 
              pendingLabel="Creando..." 
              pending={isPending}
              disabled={!scopeValid}
              className="px-5 py-2 text-sm font-bold" 
            />
          </div>
        </form>
      </div>
    </div>
  );
}
