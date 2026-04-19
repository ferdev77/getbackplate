"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AnnouncementCreateModal } from "@/shared/ui/announcement-create-modal";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

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
  users: ScopedUserOption[];
  initial?: AnnouncementInitial;
  submitEndpoint?: string;
  basePath?: string;
  onSubmitted?: (payload?: {
    mode: "create" | "edit";
    announcement: {
      id: string;
      title: string;
      body: string;
      kind: string | null;
      is_featured: boolean;
      publish_at: string | null;
      created_at: string;
      expires_at: string | null;
      target_scope: {
        locations: string[];
        department_ids: string[];
        position_ids: string[];
        users: string[];
      };
      created_by: string | null;
      created_by_name?: string;
    };
  }) => void;
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
  submitEndpoint,
  basePath = "/app/announcements",
  onSubmitted,
}: AnnouncementModalTriggerProps) {
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
        <AnnouncementCreateModal
          onClose={closeModal}
          mode={mode}
          initial={initial}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          publisherName={publisherName}
          submitEndpoint={submitEndpoint}
          redirectPath={basePath}
          onSubmitted={onSubmitted}
        />
      ) : null}
    </>
  );
}
