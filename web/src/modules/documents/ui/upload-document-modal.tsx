"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, startTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";

type Folder = { id: string; name: string };
type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type Employee = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };
type RecentDocument = { id: string; title: string; branch_id: string | null; created_at: string };

type Props = {
  onClose?: () => void;
  folders: Folder[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  recentDocuments: RecentDocument[];
};

export function UploadDocumentModal({
  onClose,
  folders,
  branches,
  departments,
  positions,
  employees,
  recentDocuments,
}: Props) {
  const router = useRouter();
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false);

  const closeModal = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push("/app/documents");
  };

  const branchMap = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isUploading) return;

    const form = event.currentTarget;
    const formData = new FormData(form);

    setProgress(0);
    setShowSuccessOverlay(false);
    setIsClosing(false);
    setIsUploading(true);

    const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/company/documents");

      xhr.upload.onprogress = (progressEvent) => {
        if (!progressEvent.lengthComputable) return;
        const next = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        setProgress(Math.max(4, Math.min(next, 98)));
      };

      xhr.onerror = () => {
        resolve({ ok: false, message: "No se pudo subir el archivo" });
      };

      xhr.onreadystatechange = () => {
        if (xhr.readyState !== XMLHttpRequest.DONE) return;
        try {
          const data = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string; message?: string };
          if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
            resolve({ ok: true, message: data.message ?? "Documento subido" });
            return;
          }
          resolve({ ok: false, message: data.error ?? "No se pudo subir el archivo" });
        } catch {
          resolve({ ok: false, message: "Respuesta invalida del servidor" });
        }
      };

      xhr.send(formData);
    });

    if (!result.ok) {
      toast.error(result.message);
      setIsUploading(false);
      setProgress(0);
      return;
    }

    setProgress(100);
    toast.success("Documento subido con éxito");
    setShowSuccessOverlay(true);
    setIsUploading(false);

    setTimeout(() => {
      setIsClosing(true);
    }, 550);

    setTimeout(() => {
      startTransition(() => {
        router.push("/app/documents");
        router.refresh();
      });
    }, 900);
  }

  return (
    <div className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5 transition-opacity duration-300 ${isClosing ? "opacity-0" : "opacity-100"}`}>
      <div className={`relative max-h-[90vh] w-[980px] max-w-[96vw] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)] transition duration-300 ${isClosing ? "scale-[0.985] opacity-0" : "scale-100 opacity-100"}`}>
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5"><p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Subir Archivo</p><button type="button" onClick={closeModal} className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">✕</button></div>
        <form onSubmit={handleSubmit}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <label className="mb-4 block cursor-pointer rounded-2xl border-2 border-dashed border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-5 py-8 text-center transition hover:border-[var(--gbp-border)]">
                  <p className="text-3xl">📂</p>
                  <p className="mt-2 text-[15px] font-bold text-[var(--gbp-text)]">Arrastra tu archivo aquí</p>
                  <p className="mt-1 text-xs text-[var(--gbp-text2)]">o haz clic para seleccionar desde tu computadora</p>
                  <span className="mt-4 inline-flex rounded-lg bg-[var(--gbp-accent)] px-3 py-2 text-xs font-bold text-white">Seleccionar archivo</span>
                  <p className="mt-3 text-[11px] text-[var(--gbp-muted)]">PDF, DOCX, XLSX · Máx. 10 MB</p>
                  {selectedFileName ? <p className="mt-2 truncate text-xs font-semibold text-[var(--gbp-text)]">Archivo: {selectedFileName}</p> : null}
                  <input name="file" type="file" required className="sr-only" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} />
                </label>

                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Titulo (opcional)</label>
                <input name="title" placeholder="Se usa el nombre del archivo si lo dejas vacio" className="mb-3 w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]" />

                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Guardar en carpeta</label>
                <select name="folder_id" value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)} className="mb-3 w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"><option value="">Raiz</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>

                <div className="mb-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Quienes pueden ver este archivo</p>
                  {selectedFolderId ? (
                    <p className="mt-1 text-xs text-[var(--gbp-text2)]">
                      Este archivo heredara automaticamente los permisos de la carpeta seleccionada.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-[var(--gbp-text2)]">Define acceso por locacion, departamento, puesto o usuario. Esta configuracion aplica cuando el archivo esta en raiz.</p>
                      <ScopeSelector
                        namespace="upload-modal"
                        branches={branches}
                        departments={departments}
                        positions={positions}
                        users={employees}
                        locationInputName="location_scope"
                        departmentInputName="department_scope"
                        positionInputName="position_scope"
                        userInputName="user_scope"
                      />
                    </>
                  )}
                </div>

                <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Descripcion (opcional)</label>
                <textarea className="mb-2 h-24 w-full resize-none rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]" placeholder="Describe brevemente el contenido del documento..." />

                {isUploading ? (
                  <div className="mt-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-[var(--gbp-text2)]"><span>Subiendo archivo...</span><span className="font-semibold">{progress}%</span></div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--gbp-border)]"><div className="h-full rounded-full bg-[var(--gbp-accent)] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                  </div>
                ) : null}
              </div>

              <aside className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
                <p className="mb-3 text-[12px] font-bold text-[var(--gbp-text)]">Subidos recientemente</p>
                <div className="space-y-2.5">
                  {recentDocuments.slice(0, 4).map((document) => {
                    const branchName = document.branch_id ? branchMap.get(document.branch_id) ?? "Locacion" : "Global";
                    return (
                      <div key={document.id} className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2">
                        <p className="truncate text-[12px] font-semibold text-[var(--gbp-text)]">{document.title}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">{branchName} · {new Date(document.created_at).toLocaleDateString("es-AR")}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[var(--gbp-success)]">Activo</p>
                      </div>
                    );
                  })}
                  {!recentDocuments.length ? <p className="text-xs text-[var(--gbp-text2)]">Sin cargas recientes.</p> : null}
                </div>
              </aside>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
            <button type="button" onClick={closeModal} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">
              Cancelar
            </button>
            <SubmitButton 
              label="Subir Archivo" 
              pendingLabel="Subiendo..." 
              pending={isUploading} 
              disabled={showSuccessOverlay}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
        </form>

        {showSuccessOverlay ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/78 backdrop-blur-[1px]">
            <div className="rounded-2xl border border-emerald-200 bg-white px-6 py-5 text-center shadow-[0_16px_40px_rgba(16,185,129,.15)]">
              <CheckCircle2 className="mx-auto h-10 w-10 animate-pulse text-emerald-600" />
              <p className="mt-2 text-sm font-bold text-emerald-700">Archivo subido con exito</p>
              <p className="mt-1 text-xs text-emerald-700/90">Actualizando vista en tiempo real...</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
