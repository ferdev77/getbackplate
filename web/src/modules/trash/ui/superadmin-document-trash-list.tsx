"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Building2, Clock, FileText, RefreshCw, Trash2, X } from "lucide-react";
import { toast } from "sonner";

type TrashedDocumentAdmin = {
  id: string;
  title: string;
  file_size_bytes: number;
  deleted_at: string;
  organization_id: string;
  organizations?: {
    name: string;
  } | null;
};

type SuperadminDocumentTrashListProps = {
  documents: TrashedDocumentAdmin[];
};

export function SuperadminDocumentTrashList({ documents }: SuperadminDocumentTrashListProps) {
  const router = useRouter();
  const [isRestoring, setIsRestoring] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [showConfirmDelete, setShowConfirmDelete] = useState<string | null>(null);

  const handleRestore = async (id: string) => {
    setIsRestoring(id);
    try {
      const res = await fetch("/api/superadmin/trash/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al restaurar");
      
      toast.success("Documento restaurado exitosamente");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al restaurar");
    } finally {
      setIsRestoring(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    setIsDeleting(id);
    try {
      const res = await fetch("/api/superadmin/trash/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error al eliminar");
      
      toast.success("Documento eliminado definitivamente");
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setIsDeleting(null);
      setShowConfirmDelete(null);
    }
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-12 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]">
          <Trash2 className="h-6 w-6" />
        </div>
        <h3 className="text-lg font-bold text-[var(--gbp-text)]">Papelera global vacía</h3>
        <p className="mt-1 text-sm text-[var(--gbp-text2)]">
          Los documentos eliminados de todas las empresas aparecerán aquí. Retención máxima: 30 días.
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

  const retentionDays = 30;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-sm">
      <div className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-5 py-3">
        <div className="grid grid-cols-[1fr_150px_100px_120px] items-center gap-4 text-xs font-semibold uppercase tracking-wider text-[var(--gbp-muted)]">
          <div>Documento y Empresa</div>
          <div>Eliminado hace</div>
          <div>Tamaño</div>
          <div className="text-right">Acciones</div>
        </div>
      </div>
      <div className="divide-y divide-[var(--gbp-border)]">
        {documents.map((doc) => {
          const deletedDate = new Date(doc.deleted_at);
          const daysSinceDeletion = Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysLeft = Math.max(0, retentionDays - daysSinceDeletion);
          const orgData = doc.organizations;

          return (
            <div key={doc.id} className="grid grid-cols-[1fr_150px_100px_120px] items-center gap-4 px-5 py-3 transition-colors hover:bg-[var(--gbp-bg)]">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--gbp-error-soft)] text-[var(--gbp-error)]">
                  <FileText className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-[var(--gbp-text)] line-clamp-1">
                    {doc.title}
                  </h4>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-[var(--gbp-text2)]">
                      <Building2 className="h-3 w-3" />
                      {orgData?.name || "Empresa Borrada"}
                    </span>
                    <span className="text-[10px] font-medium text-[var(--gbp-error)]">
                      Purga: {daysLeft}d
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-[var(--gbp-text2)]">
                  {formatDistanceToNow(deletedDate, { locale: es })}
                </span>
              </div>
              
              <div className="text-xs font-medium text-[var(--gbp-text2)]">
                {formatBytes(doc.file_size_bytes)}
              </div>
              
              <div className="flex items-center justify-end gap-2">
                {showConfirmDelete === doc.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setShowConfirmDelete(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--gbp-border)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
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
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-green-600 hover:border-green-200 hover:bg-green-50 disabled:opacity-50"
                      title="Restaurar"
                    >
                      <RefreshCw className={`h-4 w-4 ${isRestoring === doc.id ? "animate-spin" : ""}`} />
                    </button>
                    <button
                      onClick={() => setShowConfirmDelete(doc.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-red-500 hover:border-red-200 hover:bg-red-50"
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
