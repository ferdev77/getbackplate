"use client";

import { type FormEvent, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import {
  ScopeModalContent,
  ScopeModalZones,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_HEADER,
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
        throw new Error("Unable to create the folder.");
      }

      toast.success("Folder created successfully.");
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
      toast.error("Unable to create the folder.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className={SCOPE_MODAL_PANEL}>
        <div className={SCOPE_MODAL_HEADER}>
          <div>
            <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Nueva Carpeta</p>
            <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">Organiza documentos y define el alcance de acceso.</p>
          </div>
          <button type="button" onClick={closeModal} className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">✕</button>
        </div>
        <form onSubmit={onSubmit} className={SCOPE_MODAL_FORM}>
          <ScopeModalZones withScope={!hideScopeSelector}>
            <ScopeModalContent withScope={!hideScopeSelector}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Nombre de la carpeta</span>
                  <input name="name" required className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]" placeholder="ej. Manuales, Operaciones" />
                </label>

                <label>
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Crear en</span>
                  <select name="parent_id" defaultValue="" className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]">
                    <option value="">Sin carpeta</option>
                    {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
                  </select>
                </label>
              </div>

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
