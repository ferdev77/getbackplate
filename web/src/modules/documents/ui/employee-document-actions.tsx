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
  const showResponsive = labelMode === "responsive";

  return (
    <div className="flex items-center gap-2">
      <a href={`/api/documents/${documentId}/download`} target="_blank" rel="noopener noreferrer" className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
        <Eye className="h-3.5 w-3.5" /> <span className={showResponsive ? "hidden sm:inline" : "inline"}>Ver</span>
        <TooltipLabel label="Vista preliminar" />
      </a>
      <a href={`/api/documents/${documentId}/download`} download className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">
        <Download className="h-3.5 w-3.5" /> <span className={showResponsive ? "hidden sm:inline" : "inline"}>Descargar</span>
        <TooltipLabel label="Descargar" />
      </a>
      {canEdit && isOwner ? (
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2 text-xs text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
      {canDelete && isOwner ? (
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-2 text-xs text-red-700"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
