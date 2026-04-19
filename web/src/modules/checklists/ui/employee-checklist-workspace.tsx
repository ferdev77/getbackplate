"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { EmployeeChecklistPreviewModal } from "@/modules/checklists/ui/employee-checklist-preview-modal";
import { EmployeeChecklistViewTabs } from "@/modules/checklists/ui/employee-checklist-view-tabs";
import { EmployeeChecklistCreatedSection } from "@/modules/checklists/ui/employee-checklist-created-section";
import { useEmployeeChecklistPreview } from "@/modules/checklists/hooks/use-employee-checklist-preview";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { EmployeeChecklistAssignedSection } from "@/modules/checklists/ui/employee-checklist-assigned-section";

type TemplateRow = {
  id: string;
  name: string;
  sent: boolean;
  submissionStatus: string | null;
  submittedAt: string | null;
};

type CreatedTemplateRow = {
  id: string;
  name: string;
  items: string[];
};

export function EmployeeChecklistWorkspace({
  templates,
  initialPreviewTemplateId,
  createdTemplates,
  canCreate,
  canEdit,
  canDelete,
  branches,
  departments,
  positions,
  users,
}: {
  templates: TemplateRow[];
  initialPreviewTemplateId?: string;
  createdTemplates: CreatedTemplateRow[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
}) {
  const router = useRouter();
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>(templates);
  const [viewMode, setViewMode] = useState<"assigned" | "created">("assigned");
  const [mine, setMine] = useState<CreatedTemplateRow[]>(createdTemplates);

  const {
    openTemplateId,
    loadingTemplateId,
    payload,
    openPreview,
    closePreview,
    invalidateTemplate,
  } = useEmployeeChecklistPreview({
    templateRows,
    initialPreviewTemplateId,
    onInitialPreviewConsumed: () => {
      router.replace("/portal/checklist", { scroll: false });
    },
  });

  useEffect(() => {
    setTemplateRows(templates);
  }, [templates]);

  useEffect(() => {
    setMine(createdTemplates);
  }, [createdTemplates]);

  return (
    <>
      <EmployeeChecklistViewTabs viewMode={viewMode} onChange={setViewMode} />

      {viewMode === "created" ? (
        <EmployeeChecklistCreatedSection
          mine={mine}
          canCreate={canCreate}
          canEdit={canEdit}
          canDelete={canDelete}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          onRefresh={() => router.refresh()}
          onMineChange={setMine}
        />
      ) : null}

      {viewMode === "assigned" ? (
      <EmployeeChecklistAssignedSection
        templateRows={templateRows}
        loadingTemplateId={loadingTemplateId}
        onOpenPreview={(templateId) => {
          void openPreview(templateId);
        }}
      />
      ) : null}

      {openTemplateId ? (
        payload && payload.template.id === openTemplateId ? (
          <EmployeeChecklistPreviewModal
            templateId={payload.template.id}
            templateName={payload.template.name}
            sections={payload.sections}
            initialReport={payload.initialReport}
            onSubmitted={({ templateId, submittedAt }) => {
              setTemplateRows((prev) =>
                prev.map((row) =>
                  row.id === templateId
                    ? { ...row, sent: true, submissionStatus: "submitted", submittedAt }
                    : row,
                ),
              );
              invalidateTemplate(templateId);
            }}
            onClose={closePreview}
          />
        ) : (
          <div className="fixed inset-0 z-[1050] grid place-items-center bg-black/55 p-4">
            <div className="w-full max-w-[420px] rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-6 shadow-[0_24px_70px_rgba(0,0,0,.22)]">
              <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">Checklist</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-[var(--gbp-text2)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Cargando formulario...</span>
              </div>
            </div>
          </div>
        )
      ) : null}
    </>
  );
}
