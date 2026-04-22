"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, UploadCloud } from "lucide-react";

import { trackDocumentViewModeChange } from "@/modules/documents/lib/view-mode-telemetry";
import { DocumentsTreeWorkspace } from "@/modules/documents/ui/documents-tree-workspace";
import { DocumentFolderModal } from "@/modules/documents/ui/document-folder-modal";
import { UploadDocumentModal } from "@/modules/documents/ui/upload-document-modal";
import { SlideUp } from "@/shared/ui/animations";
import { DocumentViewModeToggle } from "@/shared/ui/document-view-mode-toggle";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";
import { PageContent } from "@/shared/ui/page-content";

type Folder = { id: string; name: string; parent_id: string | null; access_scope: unknown; created_at: string; created_by?: string | null };
type Document = {
  id: string;
  title: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  file_path: string;
  folder_id: string | null;
  branch_id: string | null;
  access_scope: unknown;
  created_at: string;
};
type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type ScopeUser = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type DocumentsPageWorkspaceProps = {
  organizationId: string;
  viewerUserId: string;
  folders: Folder[];
  documents: Document[];
  branches: Branch[];
  mappedBranches: Array<{ id: string; name: string }>;
  departments: Department[];
  positions: Position[];
  users: ScopeUser[];
  customBrandingEnabled: boolean;
  initialAction?: string;
  initialViewMode?: "tree" | "columns";
};

export function DocumentsPageWorkspace({
  organizationId,
  viewerUserId,
  folders,
  documents,
  branches,
  mappedBranches,
  departments,
  positions,
  users,
  customBrandingEnabled,
  initialAction,
  initialViewMode = "tree",
}: DocumentsPageWorkspaceProps) {
  const router = useRouter();
  const normalizedAction = String(initialAction ?? "").trim().toLowerCase();
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(normalizedAction === "create-folder");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(normalizedAction === "upload");
  const [viewMode, setViewMode] = useState<"tree" | "columns">(initialViewMode);
  const [hydratedViewModeKey, setHydratedViewModeKey] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.documents.view:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);

    const frame = window.requestAnimationFrame(() => {
      if (stored === "tree" || stored === "columns") {
        setViewMode((prev) => (prev === stored ? prev : stored));
      }
      setHydratedViewModeKey(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.documents.view:${organizationId}:${viewerUserId}`;
    if (hydratedViewModeKey !== key) return;
    window.localStorage.setItem(key, viewMode);
  }, [hydratedViewModeKey, organizationId, viewerUserId, viewMode]);

  const handleViewModeChange = useCallback((next: "tree" | "columns") => {
    setViewMode(next);
    trackDocumentViewModeChange({
      scope: "company",
      mode: next,
      organizationId,
      userId: viewerUserId,
    });
  }, [organizationId, viewerUserId]);

  const recentDocuments = useMemo(
    () => documents.map((document) => ({ id: document.id, title: document.title, branch_id: document.branch_id, created_at: document.created_at })),
    [documents],
  );

  const closeFolderModal = () => {
    setIsFolderModalOpen(false);
    router.replace("/app/documents");
  };

  const closeUploadModal = () => {
    setIsUploadModalOpen(false);
    router.replace("/app/documents");
  };

  return (
    <PageContent>
      <SlideUp>
        <OperationHeaderCard
          eyebrow="Operación diaria"
          title="Mis Documentos"
          description="Gestiona carpetas y archivos operativos, define su alcance y administra cargas y estructura documental."
          action={(
            <div className="flex flex-wrap gap-2">
              <DocumentViewModeToggle
                viewMode={viewMode}
                onChange={handleViewModeChange}
                testIdPrefix="documents-view"
              />
              <button type="button" onClick={() => setIsFolderModalOpen(true)} className="inline-flex h-[33px] items-center gap-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"><FolderPlus className="h-3.5 w-3.5" /> Nueva Carpeta</button>
              <button type="button" onClick={() => setIsUploadModalOpen(true)} className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-3 text-xs font-bold text-white hover:bg-[var(--gbp-accent-hover)]"><UploadCloud className="h-3.5 w-3.5" /> Subir Archivo</button>
            </div>
          )}
        />
      </SlideUp>

      <SlideUp delay={0.1}>
        <DocumentsTreeWorkspace
          organizationId={organizationId}
          viewerUserId={viewerUserId}
          folders={folders}
          documents={documents}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          customBrandingEnabled={customBrandingEnabled}
          viewMode={viewMode}
        />
      </SlideUp>

      {isFolderModalOpen ? (
        <DocumentFolderModal
          onClose={closeFolderModal}
          folders={folders}
          branches={mappedBranches}
          departments={departments}
          positions={positions}
          employees={users}
        />
      ) : null}

      {isUploadModalOpen ? (
        <UploadDocumentModal
          onClose={closeUploadModal}
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
          branches={mappedBranches}
          departments={departments}
          positions={positions}
          employees={users}
          recentDocuments={recentDocuments}
        />
      ) : null}
    </PageContent>
  );
}
