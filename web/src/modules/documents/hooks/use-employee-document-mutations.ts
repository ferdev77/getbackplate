"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";

type BaseDocument = {
  id: string;
  title: string;
};

export function useEmployeeDocumentMutations<TDocument extends BaseDocument>(
  setDocumentsState: Dispatch<SetStateAction<TDocument[]>>,
) {
  const [busy, setBusy] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<TDocument | null>(null);
  const [deleteDocument, setDeleteDocument] = useState<TDocument | null>(null);

  async function renameDocument(doc: TDocument, nextTitle: string) {
    if (!nextTitle || nextTitle === doc.title) {
      setEditingDocument(null);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/employee/documents/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id, title: nextTitle }),
      });
      if (!response.ok) throw new Error("No se pudo actualizar el documento.");
      setDocumentsState((prev) => prev.map((item) => (item.id === doc.id ? { ...item, title: nextTitle } : item)));
      setEditingDocument(null);
      toast.success("Documento actualizado.");
    } catch {
      toast.error("No se pudo actualizar el documento.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteDocumentById(doc: TDocument) {
    setBusy(true);
    try {
      const response = await fetch("/api/employee/documents/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      if (!response.ok) throw new Error("No se pudo eliminar el documento.");
      setDocumentsState((prev) => prev.filter((item) => item.id !== doc.id));
      setDeleteDocument(null);
      toast.success("Documento eliminado.");
    } catch {
      toast.error("No se pudo eliminar el documento.");
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    isUploadModalOpen,
    setIsUploadModalOpen,
    editingDocument,
    setEditingDocument,
    deleteDocument,
    setDeleteDocument,
    renameDocument,
    deleteDocumentById,
  };
}
