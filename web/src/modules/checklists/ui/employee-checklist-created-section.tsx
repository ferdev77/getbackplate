"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { ChecklistCreateTrigger } from "@/modules/checklists/ui/checklist-create-trigger";
import { ChecklistDeleteModal } from "@/modules/checklists/ui/checklist-delete-modal";
import { ChecklistEditTrigger } from "@/modules/checklists/ui/checklist-edit-trigger";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

type CreatedTemplateRow = {
  id: string;
  name: string;
  items: string[];
};

type Props = {
  mine: CreatedTemplateRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  onRefresh: () => void;
  onMineChange: (next: CreatedTemplateRow[]) => void;
};

export function EmployeeChecklistCreatedSection({
  mine,
  canCreate,
  canEdit,
  canDelete,
  branches,
  departments,
  positions,
  users,
  onRefresh,
  onMineChange,
}: Props) {
  const [deleteTemplate, setDeleteTemplate] = useState<CreatedTemplateRow | null>(null);

  return (
    <section className="space-y-3">
      {canCreate ? (
        <div className="flex justify-end">
          <ChecklistCreateTrigger
            className="inline-flex items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--gbp-accent)]"
            branches={branches}
            departments={departments}
            positions={positions}
            users={users}
            submitEndpoint="/api/employee/checklists/templates"
            basePath="/portal/checklist"
            onSubmitted={onRefresh}
          >
            Nuevo Checklist
          </ChecklistCreateTrigger>
        </div>
      ) : null}

      {mine.map((row) => (
        <article key={row.id} className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4">
          <p className="text-sm font-semibold text-[var(--gbp-text)]">{row.name}</p>
          <p className="mt-1 text-xs text-[var(--gbp-text2)]">{row.items.length} item(s)</p>
          <div className="mt-2 flex justify-end gap-2">
            {canEdit ? (
              <ChecklistEditTrigger
                className="inline-flex items-center gap-1 rounded-md border border-[var(--gbp-border2)] px-3 py-1 text-xs font-semibold"
                template={{
                  id: row.id,
                  name: row.name,
                  templateSections: [{ name: "General", items: row.items }],
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
                <Pencil className="h-3.5 w-3.5" /> Editar
              </ChecklistEditTrigger>
            ) : null}
            {canDelete ? (
              <button
                type="button"
                onClick={() => setDeleteTemplate(row)}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </button>
            ) : null}
          </div>
        </article>
      ))}

      {!mine.length ? (
        <div className="rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">
          Aun no creaste checklists.
        </div>
      ) : null}

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
