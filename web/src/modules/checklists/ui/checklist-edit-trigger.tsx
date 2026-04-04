"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ChecklistUpsertModal } from "@/modules/checklists/ui/checklist-upsert-modal";

type BranchOption = { id: string; name: string };
type DepartmentOption = { id: string; name: string };
type PositionOption = { id: string; department_id: string; name: string };
type UserOption = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  role_label?: string;
  location_label?: string;
  department_label?: string;
  position_label?: string;
};

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
  users: UserOption[];
};

export function ChecklistEditTrigger({
  className,
  children,
  template,
  branches,
  departments,
  positions,
  users,
}: ChecklistEditTriggerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeModal = () => {
    setIsOpen(false);
    router.replace("/app/checklists");
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
        />
      ) : null}
    </>
  );
}
