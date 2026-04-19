"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { ChecklistUpsertModal } from "@/modules/checklists/ui/checklist-upsert-modal";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

type ChecklistCreateTriggerProps = {
  className: string;
  children: ReactNode;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  submitEndpoint?: string;
  basePath?: string;
  onSubmitted?: () => void;
};

export function ChecklistCreateTrigger({
  className,
  children,
  branches,
  departments,
  positions,
  users,
  submitEndpoint,
  basePath = "/app/checklists",
  onSubmitted,
}: ChecklistCreateTriggerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeModal = () => {
    setIsOpen(false);
    router.replace(basePath);
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
          submitEndpoint={submitEndpoint}
          redirectPath={basePath}
          onSubmitted={onSubmitted}
        />
      ) : null}
    </>
  );
}
