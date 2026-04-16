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

type ChecklistCreateTriggerProps = {
  className: string;
  children: ReactNode;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: UserOption[];
};

export function ChecklistCreateTrigger({
  className,
  children,
  branches,
  departments,
  positions,
  users,
}: ChecklistCreateTriggerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeModal = () => {
    setIsOpen(false);
    router.replace("/app/checklists");
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={className} data-testid="create-checklist-btn">
        {children}
      </button>

      {isOpen ? (
        <ChecklistUpsertModal
          onClose={closeModal}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          action="create"
          editingTemplate={null}
        />
      ) : null}
    </>
  );
}
