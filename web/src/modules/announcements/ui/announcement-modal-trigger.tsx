"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AnnouncementCreateModal } from "@/shared/ui/announcement-create-modal";

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

type AnnouncementInitial = {
  id: string;
  kind: string;
  title: string;
  body: string;
  expires_at: string | null;
  is_featured: boolean;
  location_scope: string[];
  department_scope: string[];
  position_scope: string[];
  user_scope: string[];
};

type AnnouncementModalTriggerProps = {
  className: string;
  children: ReactNode;
  mode: "create" | "edit";
  publisherName: string;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: UserOption[];
  initial?: AnnouncementInitial;
};

export function AnnouncementModalTrigger({
  className,
  children,
  mode,
  publisherName,
  branches,
  departments,
  positions,
  users,
  initial,
}: AnnouncementModalTriggerProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const closeModal = () => {
    setIsOpen(false);
    router.replace("/app/announcements");
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={className}>
        {children}
      </button>

      {isOpen ? (
        <AnnouncementCreateModal
          onClose={closeModal}
          mode={mode}
          initial={initial}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          publisherName={publisherName}
        />
      ) : null}
    </>
  );
}
