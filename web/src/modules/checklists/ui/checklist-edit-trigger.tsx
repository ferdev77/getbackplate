"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ChecklistUpsertModal } from "@/modules/checklists/ui/checklist-upsert-modal";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

type EditingTemplate = {
  id: string;
  name?: string;
  checklist_type?: string;
  shift?: string;
  repeat_every?: string;
  is_active?: boolean;
  target_scope?: Record<string, string[]>;
  templateSections?: Array<{ name: string; items: string[] }>;
  templateItems?: Array<{ label: string }>;
  scheduledJob?: { recurrence_type: string; custom_days: number[]; cron_expression?: string } | null;
};

type ChecklistEditTriggerProps = {
  className: string;
  children: ReactNode;
  template: EditingTemplate;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  submitEndpoint?: string;
  basePath?: string;
  onSubmitted?: () => void;
};

export function ChecklistEditTrigger({
  className,
  children,
  template,
  branches,
  departments,
  positions,
  users,
  submitEndpoint,
  basePath = "/app/checklists",
  onSubmitted,
}: ChecklistEditTriggerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeModal = () => {
    setIsOpen(false);
    router.replace(basePath);
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={className}>
        {children}
      </button>

      {isOpen ? (
        <ChecklistUpsertModal
          onClose={closeModal}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          action="edit"
          editingTemplate={template}
          submitEndpoint={submitEndpoint}
          redirectPath={basePath}
          onSubmitted={onSubmitted}
        />
      ) : null}
    </>
  );
}
