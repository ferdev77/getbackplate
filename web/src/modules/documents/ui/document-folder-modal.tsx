"use client";

import { type FormEvent, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";

type Folder = { id: string; name: string };
type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type Employee = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type DocumentFolderModalProps = {
  onClose?: () => void;
  folders: Folder[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  submitEndpoint?: string;
  redirectPath?: string;
  hideScopeSelector?: boolean;
};

export function DocumentFolderModal({
  onClose,
  folders,
  branches,
  departments,
  positions,
  employees,
  submitEndpoint = "/api/company/document-folders",
  redirectPath = "/app/documents",
  hideScopeSelector = false,
}: DocumentFolderModalProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

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
      };

      const body = hideScopeSelector
        ? { name: payload.name, parentId: payload.parentId }
        : payload;

      const response = await fetch(submitEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear carpeta");
      }

      toast.success("Carpeta creada");
      startTransition(() => {
        if (onClose) {
          onClose();
        } else {
          router.push(redirectPath);
        }
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear carpeta");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[92vh] w-[1040px] max-w-[97vw] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <div>
            <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">Nueva Carpeta</p>
            <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">Organiza documentos y define el alcance de acceso.</p>
          </div>
          <button type="button" onClick={closeModal} className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">✕</button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="max-h-[74vh] overflow-y-auto px-6 py-5">
            <div className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
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

              {!hideScopeSelector ? (
                <div className="mt-4 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
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
                  />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
            <button type="button" onClick={closeModal} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</button>
            <SubmitButton 
              label="Crear Carpeta" 
              pendingLabel="Creando..." 
              pending={isPending}
              className="px-5 py-2 text-sm font-bold" 
            />
          </div>
        </form>
      </div>
    </div>
  );
}
