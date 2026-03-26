"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { AlertTriangle, Clock, FileText, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type TrashedDocument = {
  id: string;
  title: string;
  file_size_bytes: number;
  deleted_at: string;
};

type DocumentTrashListProps = {
  documents: TrashedDocument[];
  isAdminView?: boolean;
};

const DARK_TEXT = "[.theme-dark-pro_&]:text-[#e7edf7]";
const DARK_MUTED = "[.theme-dark-pro_&]:text-[#94a3b8]";
const DARK_BORDER = "[.theme-dark-pro_&]:border-[#334155]";
const DARK_BG = "[.theme-dark-pro_&]:bg-[#1e293b]";
const DARK_HOVER = "[.theme-dark-pro_&]:hover:bg-[#334155]";

export function DocumentTrashList({ documents, isAdminView = false }: DocumentTrashListProps) {
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  const handleRestore = async (id: string) => {
    setIsRestoring(id);
    try {
      const res = await fetch(isAdminView ? "/api/superadmin/trash/documents" : "/api/company/trash/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al restaurar");
      
      toast.success("Documento restaurado exitosamente");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsRestoring(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setIsDeleting(id);
    try {
      const res = await fetch(isAdminView ? "/api/superadmin/trash/documents" : "/api/company/trash/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar");
      
      toast.success("Documento eliminado definitivamente");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsDeleting(null);
      setShowConfirmDelete(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#dcd6d2] bg-[#fdfaf8] p-12 text-center ${DARK_BG} ${DARK_BORDER}`}>
        <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600 [.theme-dark-pro_&]:bg-orange-500/20 [.theme-dark-pro_&]:text-orange-400`}>
          <Trash2 className="h-6 w-6" />
        </div>
        <h3 className={`text-lg font-bold text-[#1f1a17] ${DARK_TEXT}`}>La papelera está vacía</h3>
        <p className={`mt-1 text-sm text-[#736a64] ${DARK_MUTED}`}>
          Los documentos eliminados aparecerán aquí por {isAdminView ? "30" : "15"} días antes de borrarse permanentemente.
        </p>
      </div>
    );
  }

  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024, dm = 2, sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  const retentionDays = isAdminView ? 30 : 15;

  return (
    <div className={`overflow-hidden rounded-2xl border border-[#ece7e4] bg-white shadow-sm ${DARK_BG} ${DARK_BORDER}`}>
      <div className={`border-b border-[#ece7e4] bg-[#fbf9f8] px-5 py-3 ${DARK_BORDER} [.theme-dark-pro_&]:bg-[#1e293b]/50`}>
        <div className="grid grid-cols-[1fr_150px_100px_120px] items-center gap-4 text-xs font-semibold uppercase tracking-wider text-[#a0948b]">
          <div>Documento</div>
          <div>Eliminado hace</div>
          <div>Tamaño</div>
          <div className="text-right">Acciones</div>
        </div>
      </div>
      <div className="divide-y divide-[#ece7e4] [.theme-dark-pro_&]:divide-[#334155]">
        {documents.map((doc) => {
          const deletedDate = new Date(doc.deleted_at);
          const daysSinceDeletion = Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysLeft = Math.max(0, retentionDays - daysSinceDeletion);
          
          return (
            <div key={doc.id} className={`grid grid-cols-[1fr_150px_100px_120px] items-center gap-4 px-5 py-3 transition-colors hover:bg-[#fbf9f8] ${DARK_HOVER}`}>
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-600 [.theme-dark-pro_&]:bg-red-500/20 [.theme-dark-pro_&]:text-red-400">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h4 className={`text-sm font-semibold text-[#1f1a17] line-clamp-1 ${DARK_TEXT}`}>
                    {doc.title}
                  </h4>
                  <p className={`mt-0.5 text-xs text-red-500 font-medium [.theme-dark-pro_&]:text-red-400`}>
                    Se purgará en {daysLeft} {daysLeft === 1 ? 'día' : 'días'}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className={`text-xs text-[#514b47] ${DARK_MUTED}`}>
                  {formatDistanceToNow(deletedDate, { locale: es })}
                </span>
              </div>
              
              <div className={`text-xs font-medium text-[#736a64] ${DARK_MUTED}`}>
                {formatBytes(doc.file_size_bytes)}
              </div>
              
              <div className="flex items-center justify-end gap-2">
                {showConfirmDelete === doc.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowConfirmDelete(null)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border border-[#ece7e4] text-[#514b47] hover:bg-gray-100 ${DARK_BORDER} ${DARK_TEXT} [.theme-dark-pro_&]:hover:bg-slate-700`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(doc.id)}
                      disabled={isDeleting === doc.id}
                      className="flex h-8 w-8 items-center justify-center rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      title="Eliminar definitivamente"
                    >
                      {isDeleting === doc.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => handleRestore(doc.id)}
                      disabled={isRestoring === doc.id}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border border-[#ece7e4] bg-white text-green-600 hover:border-green-200 hover:bg-green-50 disabled:opacity-50 ${DARK_BORDER} [.theme-dark-pro_&]:bg-transparent [.theme-dark-pro_&]:text-green-400 [.theme-dark-pro_&]:hover:bg-green-500/10`}
                      title="Restaurar"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRestoring === doc.id ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => setShowConfirmDelete(doc.id)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md border border-[#ece7e4] bg-white text-red-500 hover:border-red-200 hover:bg-red-50 ${DARK_BORDER} [.theme-dark-pro_&]:bg-transparent [.theme-dark-pro_&]:text-red-400 [.theme-dark-pro_&]:hover:bg-red-500/10`}
                      title="Eliminar permanentemente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
