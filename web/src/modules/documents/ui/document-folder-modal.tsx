"use client";

import { type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";

type Folder = { id: string; name: string };
type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type Employee = { id: string; user_id: string | null; first_name: string; last_name: string };

type DocumentFolderModalProps = {
  folders: Folder[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
};

export function DocumentFolderModal({
  folders,
  branches,
  departments,
  positions,
  employees,
}: DocumentFolderModalProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

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

      const response = await fetch("/api/company/document-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo crear carpeta");
      }

      toast.success("Carpeta creada");
      router.push("/app/documents");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear carpeta");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[480px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[#111]">Nueva Carpeta</p>
          <Link href="/app/documents" className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]">✕</Link>
        </div>
        <form onSubmit={onSubmit}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Nombre de la carpeta</label>
            <input name="name" required className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm" placeholder="ej. Manuales, Operaciones" />
            
            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Crear en</label>
            <select name="parent_id" defaultValue="" className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm">
              <option value="">Raiz</option>
              {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
            
            <div className="mt-4">
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
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
            <Link href="/app/documents" className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]">Cancelar</Link>
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
