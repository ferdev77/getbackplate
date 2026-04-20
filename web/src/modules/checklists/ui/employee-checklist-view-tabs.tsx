"use client";

import { AssignedCreatedToggle } from "@/shared/ui/assigned-created-toggle";

type Props = {
  viewMode: "assigned" | "created";
  onChange: (next: "assigned" | "created") => void;
  assignedCount: number;
  createdCount: number;
};

export function EmployeeChecklistViewTabs({ viewMode, onChange, assignedCount, createdCount }: Props) {
  return (
    <AssignedCreatedToggle
      viewMode={viewMode}
      onChange={onChange}
      assignedLabel="Asignados"
      createdLabel="Creados"
      assignedCount={assignedCount}
      createdCount={createdCount}
      title="Checklists"
      variant="header"
    />
  );
}
