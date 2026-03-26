"use client";

import Link from "next/link";
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
  folders: Folder[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  employees: Employee[];
  recentDocuments: RecentDocument[];
};

const DARK_PANEL = "[.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#9aabc3]";
const DARK_GHOST = "[.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#d8e3f2] [.theme-dark-pro_&]:hover:bg-[#172131]";
const DARK_SOFT = "[.theme-dark-pro_&]:border-[#263244] [.theme-dark-pro_&]:bg-[#111824]";

export function UploadDocumentModal({
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
      <div className={`relative max-h-[90vh] w-[980px] max-w-[96vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)] transition duration-300 ${DARK_PANEL} ${isClosing ? "scale-[0.985] opacity-0" : "scale-100 opacity-100"}`}>
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5 [.theme-dark-pro_&]:border-[#2b3646]"><p className={`font-serif text-[15px] font-bold text-[#111] ${DARK_TEXT}`}>Subir Archivo</p><Link href="/app/documents" className={`grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111] ${DARK_GHOST}`}>✕</Link></div>
        <form onSubmit={handleSubmit}>
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div>
                <label className={`mb-4 block cursor-pointer rounded-2xl border-2 border-dashed border-[#eadfd8] bg-[#fdf9f7] px-5 py-8 text-center transition hover:border-[#d8c8be] ${DARK_SOFT}`}>
                  <p className="text-3xl">📂</p>
                  <p className={`mt-2 text-[15px] font-bold text-[#2b2420] ${DARK_TEXT}`}>Arrastra tu archivo aquí</p>
                  <p className={`mt-1 text-xs text-[#8b817c] ${DARK_MUTED}`}>o haz clic para seleccionar desde tu computadora</p>
                  <span className="mt-4 inline-flex rounded-lg bg-[#111] px-3 py-2 text-xs font-bold text-white">Seleccionar archivo</span>
                  <p className={`mt-3 text-[11px] text-[#b1a7a2] ${DARK_MUTED}`}>PDF, DOCX, XLSX · Máx. 10 MB</p>
                  {selectedFileName ? <p className={`mt-2 truncate text-xs font-semibold text-[#4a433f] ${DARK_TEXT}`}>Archivo: {selectedFileName}</p> : null}
                  <input name="file" type="file" required className="sr-only" onChange={(event) => setSelectedFileName(event.target.files?.[0]?.name ?? "")} />
                </label>

                <label className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>Titulo (opcional)</label>
                <input name="title" placeholder="Se usa el nombre del archivo si lo dejas vacio" className={`mb-3 w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`} />

                <label className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>Guardar en carpeta</label>
                <select name="folder_id" value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)} className={`mb-3 w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`}><option value="">Raiz</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select>

                <div className={`mb-3 rounded-xl border border-[#e8e1dc] bg-[#fcf9f7] p-3 ${DARK_SOFT}`}>
                  <p className={`text-[11px] font-bold uppercase tracking-[0.1em] text-[#8d847f] ${DARK_MUTED}`}>Quienes pueden ver este archivo</p>
                  {selectedFolderId ? (
                    <p className={`mt-1 text-xs text-[#7c726d] ${DARK_MUTED}`}>
                      Este archivo heredara automaticamente los permisos de la carpeta seleccionada.
                    </p>
                  ) : (
                    <>
                      <p className={`mt-1 text-xs text-[#7c726d] ${DARK_MUTED}`}>Define acceso por locacion, departamento, puesto o usuario. Esta configuracion aplica cuando el archivo esta en raiz.</p>
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

                <label className={`mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa] ${DARK_MUTED}`}>Descripcion (opcional)</label>
                <textarea className={`mb-2 h-24 w-full resize-none rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm ${DARK_GHOST}`} placeholder="Describe brevemente el contenido del documento..." />

                {isUploading ? (
                  <div className={`mt-3 rounded-xl border border-[#e7ddd8] bg-[#fffaf8] p-3 ${DARK_SOFT}`}>
                    <div className={`mb-2 flex items-center justify-between text-xs text-[#6d645f] ${DARK_MUTED}`}><span>Subiendo archivo...</span><span className="font-semibold">{progress}%</span></div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#efe3de]"><div className="h-full rounded-full bg-[#c0392b] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
                  </div>
                ) : null}
              </div>

              <aside className={`rounded-xl border border-[#ece3de] bg-[#fffcfb] p-4 ${DARK_SOFT}`}>
                <p className={`mb-3 text-[12px] font-bold text-[#433b36] ${DARK_TEXT}`}>Subidos recientemente</p>
                <div className="space-y-2.5">
                  {recentDocuments.slice(0, 4).map((document) => {
                    const branchName = document.branch_id ? branchMap.get(document.branch_id) ?? "Locacion" : "Global";
                    return (
                      <div key={document.id} className={`rounded-lg border border-[#efe7e2] bg-white px-3 py-2 ${DARK_SOFT}`}>
                        <p className={`truncate text-[12px] font-semibold text-[#2f2925] ${DARK_TEXT}`}>{document.title}</p>
                        <p className={`mt-0.5 text-[11px] text-[#978d88] ${DARK_MUTED}`}>{branchName} · {new Date(document.created_at).toLocaleDateString("es-AR")}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[#2d8f4f]">Activo</p>
                      </div>
                    );
                  })}
                  {!recentDocuments.length ? <p className={`text-xs text-[#9b908b] ${DARK_MUTED}`}>Sin cargas recientes.</p> : null}
                </div>
              </aside>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4 [.theme-dark-pro_&]:border-[#2b3646]">
            <Link href="/app/documents" className={`rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333] ${DARK_GHOST}`}>
              Cancelar
            </Link>
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
