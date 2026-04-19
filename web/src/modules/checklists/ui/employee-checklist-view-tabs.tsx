"use client";

import { AssignedCreatedToggle } from "@/shared/ui/assigned-created-toggle";

type Props = {
  viewMode: "assigned" | "created";
  onChange: (next: "assigned" | "created") => void;
};

export function EmployeeChecklistViewTabs({ viewMode, onChange }: Props) {
  return <AssignedCreatedToggle viewMode={viewMode} onChange={onChange} />;
}
