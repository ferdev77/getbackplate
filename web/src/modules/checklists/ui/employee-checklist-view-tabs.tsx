"use client";

import { AssignedCreatedToggle } from "@/shared/ui/assigned-created-toggle";

type Props = {
  viewMode: "assigned" | "created";
  onChange: (next: "assigned" | "created") => void;
  assignedCount: number;
  createdCount: number;
  showCreated?: boolean;
};

export function EmployeeChecklistViewTabs({ viewMode, onChange, assignedCount, createdCount, showCreated = true }: Props) {
  return (
    <AssignedCreatedToggle
      viewMode={viewMode}
      onChange={onChange}
      showCreated={showCreated}
      assignedLabel="Asignados"
      createdLabel="Creados"
      assignedCount={assignedCount}
      createdCount={createdCount}
      title="Checklists"
      variant="header"
    />
  );
}
