"use client";

import { Download, Eye, Pencil, Trash2 } from "lucide-react";

import { TooltipLabel } from "@/shared/ui/tooltip";

type Props = {
  documentId: string;
  canEdit: boolean;
  canDelete: boolean;
  isOwner: boolean;
  onEdit: () => void;
  onDelete: () => void;
  labelMode?: "responsive" | "full";
};

export function EmployeeDocumentActions({
  documentId,
  canEdit,
  canDelete,
  isOwner,
  onEdit,
  onDelete,
  labelMode = "responsive",
}: Props) {


  return (
    <div className="flex items-center gap-2" draggable={false} onDragStart={(e) => e.stopPropagation()}>
      <a href={`/api/documents/${documentId}/download?inline=1`} target="_blank" rel="noopener noreferrer" className="group/tooltip relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
        <Eye className="h-4 w-4" />
        <TooltipLabel label="Ver" />
      </a>
      <a href={`/api/documents/${documentId}/download`} download className="group/tooltip relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
        <Download className="h-4 w-4" />
        <TooltipLabel label="Descargar" />
      </a>
      {canEdit && isOwner ? (
        <button
          type="button"
          onClick={onEdit}
          className="group/tooltip relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
        >
          <Pencil className="h-4 w-4" />
          <TooltipLabel label="Editar" />
        </button>
      ) : null}
      {canDelete && isOwner ? (
        <button
          type="button"
          onClick={onDelete}
          className="group/tooltip relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100"
        >
          <Trash2 className="h-4 w-4" />
          <TooltipLabel label="Eliminar" />
        </button>
      ) : null}
    </div>
  );
}
