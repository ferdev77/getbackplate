"use client";

import { useState } from "react";
import { ClipboardCheck, Eye, Pencil, Trash2 } from "lucide-react";

import { ChecklistDeleteModal } from "@/modules/checklists/ui/checklist-delete-modal";
import { ChecklistEditTrigger } from "@/modules/checklists/ui/checklist-edit-trigger";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { TooltipLabel } from "@/shared/ui/tooltip";

type CreatedTemplateRow = {
  id: string;
  name: string;
  items: string[];
  checklist_type?: string;
  shift?: string;
  repeat_every?: string;
  is_active?: boolean;
  target_scope?: Record<string, string[]>;
  templateSections?: Array<{ name: string; items: string[] }>;
  sent?: boolean;
  submissionStatus?: string | null;
  submittedAt?: string | null;
};

type Props = {
  mine: CreatedTemplateRow[];
  canEdit: boolean;
  canDelete: boolean;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  onRefresh: () => void;
  onMineChange: (next: CreatedTemplateRow[]) => void;
  loadingTemplateId: string;
  onOpenTemplatePreview: (templateId: string) => void;
};

export function EmployeeChecklistCreatedSection({
  mine,
  canEdit,
  canDelete,
  branches,
  departments,
  positions,
  users,
  onRefresh,
  onMineChange,
  loadingTemplateId,
  onOpenTemplatePreview,
}: Props) {
  const [deleteTemplate, setDeleteTemplate] = useState<CreatedTemplateRow | null>(null);

  function statusBadge(row: CreatedTemplateRow) {
    if (row.sent) {
      if (row.submissionStatus === "reviewed") {
        return "border-amber-300/40 bg-amber-50 text-amber-700";
      }
      return "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]";
    }
    return "border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]";
  }

  function statusLabel(row: CreatedTemplateRow) {
    if (row.sent) {
      return row.submissionStatus === "reviewed" ? "Reporte revisado" : "Reporte enviado";
    }
    return "Pendiente";
  }

  return (
    <section className="space-y-3">
      <section className="overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="grid grid-cols-[1fr_170px_130px] gap-x-3 border-b-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-2.5 text-[11px] font-bold tracking-[0.07em] uppercase text-[var(--gbp-muted)]">
          <p>Checklist</p>
          <p>Estado reporte</p>
          <p>Acciones</p>
        </div>

        {mine.length > 0 ? (
          <div>
            {mine.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_170px_130px] items-center gap-x-3 border-b border-[var(--gbp-border)] px-4 py-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2 text-[var(--gbp-text)]">
                    <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
                    <p className="truncate text-[13px] font-semibold">{row.name}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">{row.items.length} item(s)</p>
                </div>

                <div>
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${statusBadge(row)}`}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                    <span>{statusLabel(row)}</span>
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onOpenTemplatePreview(row.id)}
                    disabled={loadingTemplateId === row.id}
                    className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)] disabled:opacity-70"
                  >
                    <Eye className="h-4 w-4" />
                    <TooltipLabel label={loadingTemplateId === row.id ? "Cargando..." : "Vista previa"} />
                  </button>
                  {canEdit ? (
                    <ChecklistEditTrigger
                      className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
                      template={{
                        id: row.id,
                        name: row.name,
                        checklist_type: row.checklist_type,
                        shift: row.shift,
                        repeat_every: row.repeat_every,
                        is_active: row.is_active,
                        target_scope: row.target_scope,
                        templateSections: row.templateSections?.length ? row.templateSections : [{ name: "General", items: row.items }],
                        templateItems: row.items.map((item) => ({ label: item })),
                      }}
                      branches={branches}
                      departments={departments}
                      positions={positions}
                      users={users}
                      submitEndpoint="/api/employee/checklists/templates"
                      basePath="/portal/checklist"
                      onSubmitted={onRefresh}
                    >
                      <Pencil className="h-4 w-4" />
                      <TooltipLabel label="Editar" />
                    </ChecklistEditTrigger>
                  ) : null}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => setDeleteTemplate(row)}
                      className="group/tooltip relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_18%,transparent)]"
                    >
                      <Trash2 className="h-4 w-4" />
                      <TooltipLabel label="Eliminar" />
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">Aún no creaste checklists.</div>
        )}
      </section>

      {deleteTemplate ? (
        <ChecklistDeleteModal
          template={{ id: deleteTemplate.id, name: deleteTemplate.name }}
          submitEndpoint="/api/employee/checklists/templates"
          redirectPath="/portal/checklist"
          onSubmitted={() => {
            onMineChange(mine.filter((row) => row.id !== deleteTemplate.id));
            setDeleteTemplate(null);
          }}
        />
      ) : null}
    </section>
  );
}
