"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Folder, GripVertical, UploadCloud, FolderPlus } from "lucide-react";
// AnimatePresence removed — it interferes with HTML5 DnD by controlling DOM mounting

import { EmptyState } from "@/shared/ui/empty-state";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { UploadDocumentModal } from "@/modules/documents/ui/upload-document-modal";
import { DocumentFolderModal } from "@/modules/documents/ui/document-folder-modal";
import { EmployeeDocumentEditModal } from "@/modules/documents/ui/employee-document-edit-modal";
import { EmployeeDocumentActions } from "@/modules/documents/ui/employee-document-actions";
import { trackDocumentViewModeChange } from "@/modules/documents/lib/view-mode-telemetry";
import { useEmployeeDocumentMutations } from "@/modules/documents/hooks/use-employee-document-mutations";
import { useEmployeeDocumentsPreferences } from "@/modules/documents/hooks/use-employee-documents-preferences";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { DocumentPreviewPanel } from "@/modules/documents/ui/document-preview-panel";
import { AssignedCreatedToggle } from "@/shared/ui/assigned-created-toggle";
import { DocumentViewModeToggle } from "@/shared/ui/document-view-mode-toggle";
import { FilterBar } from "@/shared/ui/filter-bar";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";
import { useDndSafetyNet, markDndActive, markDndInactive } from "@/modules/documents/hooks/use-dnd-safety-net";
import { toast } from "sonner";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  access_scope?: unknown;
  created_at: string;
  created_by?: string | null;
};

type DocumentRow = {
  id: string;
  title: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  folder_id: string | null;
  created_at: string;
  owner_user_id?: string | null;
  is_new?: boolean;
  branch_id?: string | null;
  access_scope?: unknown;
};

function parseScope(scope: unknown) {
  if (!scope || typeof scope !== "object") {
    return { departments: [] as string[], users: [] as string[] };
  }
  const value = scope as Record<string, unknown>;
  return {
    departments: Array.isArray(value.department_ids)
      ? value.department_ids.filter((x): x is string => typeof x === "string")
      : [],
    users: Array.isArray(value.users)
      ? value.users.filter((x): x is string => typeof x === "string")
      : [],
  };
}

function hasAnyScopeValue(scope: ReturnType<typeof parseScope>) {
  return scope.departments.length > 0 || scope.users.length > 0;
}

type Props = {
  organizationId: string;
  viewerUserId: string;
  viewerUserName?: string;
  folders: FolderRow[];
  documents: DocumentRow[];
  initialViewMode?: "tree" | "columns";
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  showCreatedView?: boolean;
  branches?: BranchOption[];
  departments?: DepartmentOption[];
  positions?: PositionOption[];
  users?: ScopedUserOption[];
  recentDocuments?: Array<{ id: string; title: string; branch_id: string | null; created_at: string }>;
  allowedLocationIds?: string[];
};

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isPreviewableMime(mimeType: string | null) {
  if (!mimeType) return false;
  return mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("text/");
}

export function EmployeeDocumentsTree({
  organizationId,
  viewerUserId,
  viewerUserName,
  folders,
  documents,
  initialViewMode = "tree",
  canCreate = false,
  canEdit = false,
  canDelete = false,
  showCreatedView = true,
  branches = [],
  departments = [],
  positions = [],
  users = [],
  recentDocuments = [],
  allowedLocationIds = [],
}: Props) {
  const router = useRouter();
  const [documentsState, setDocumentsState] = useState<DocumentRow[]>(documents);
  const [folderRows, setFolderRows] = useState<FolderRow[]>(folders);
  const [ownershipView, setOwnershipView] = useState<"assigned" | "created">("assigned");
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [selectedColumnDocId, setSelectedColumnDocId] = useState<string | null>(null);
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [dropRootColumn, setDropRootColumn] = useState(false);
  const [dropColumnTargetId, setDropColumnTargetId] = useState<string | null>(null);
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [previewState, setPreviewState] = useState<{ docId: string | null; status: "idle" | "loading" | "ready" | "error" }>({
    docId: null,
    status: "idle",
  });
  const {
    viewMode,
    setViewMode,
    selectedColumnFolderId,
    setSelectedColumnFolderId,
  } = useEmployeeDocumentsPreferences({
    organizationId,
    viewerUserId,
    initialViewMode,
  });
  const columnsScrollRef = useRef<HTMLDivElement | null>(null);
  const previousColumnCountRef = useRef(1);
  const suppressColumnClickRef = useRef(false);
  const dragMetaRef = useRef<{ kind: "document" | "folder" | null; id: string | null }>({ kind: null, id: null });
  const dndDebugEnabled = process.env.NODE_ENV === "development";
  const dndDebugSnapshotRef = useRef<{ event: string; details: Record<string, unknown>; at: string } | null>(null);
  const prevDocumentsKeyRef = useRef("");
  const prevFoldersKeyRef = useRef("");
  const deferredPropsRef = useRef<{ documents?: DocumentRow[]; folders?: FolderRow[] } | null>(null);

  function logDnd(event: string, details: Record<string, unknown>) {
    if (!dndDebugEnabled) return;
    console.debug(`[documents-dnd:employee] ${event}`, details);
    dndDebugSnapshotRef.current = { event, details, at: new Date().toLocaleTimeString() };
  }




  function resetDndState() {
    dragMetaRef.current = { kind: null, id: null };
    setDraggedDocumentId(null);
    setDraggedFolderId(null);
    setDropFolderId(null);
    setDropRootColumn(false);
    setDropColumnTargetId(null);
    suppressColumnClickRef.current = false;
    markDndInactive();
    // Flush any props that arrived during drag
    if (deferredPropsRef.current) {
      const deferred = deferredPropsRef.current;
      deferredPropsRef.current = null;
      if (deferred.documents) setDocumentsState(deferred.documents);
      if (deferred.folders) setFolderRows(deferred.folders);
    }
  }

  // ── DnD Safety Net (see DOCS/DND_SAFETY_NET.md) ──
  const { resetOnPropsSync } = useDndSafetyNet({
    resetDndState,
    isDragActive: () => Boolean(draggedDocumentId || draggedFolderId || dragMetaRef.current.kind),
    onDeferredRefresh: () => router.refresh(),
  });

  const {
    busy,
    isUploadModalOpen,
    setIsUploadModalOpen,
    editingDocument,
    setEditingDocument,
    deleteDocument,
    setDeleteDocument,
    renameDocument,
    deleteDocumentById,
  } = useEmployeeDocumentMutations<DocumentRow>(setDocumentsState);

  // ── Stable props sync ──
  // The EmployeeShell polls router.refresh() every 8s, which re-executes the
  // Server Component and creates NEW array references via .map() even when
  // data hasn't changed.  Using JSON.stringify to detect *real* changes avoids
  // gratuitous re-renders that destroy draggable DOM nodes mid-drag.

  useEffect(() => {
    const key = JSON.stringify(documents.map((d) => d.id + d.folder_id + d.title));
    if (key === prevDocumentsKeyRef.current) return; // no real change
    prevDocumentsKeyRef.current = key;

    // Don't update state during active drag — it would destroy DOM nodes
    if (dragMetaRef.current.kind) {
      deferredPropsRef.current = { ...deferredPropsRef.current, documents };
      return;
    }
    setDocumentsState(documents);
  }, [documents]);

  useEffect(() => {
    const key = JSON.stringify(folders.map((f) => f.id + f.parent_id + f.name));
    if (key === prevFoldersKeyRef.current) return;
    prevFoldersKeyRef.current = key;

    if (dragMetaRef.current.kind) {
      deferredPropsRef.current = { ...deferredPropsRef.current, folders };
      return;
    }
    setFolderRows(folders);
  }, [folders]);

  useEffect(() => {
    if (!showCreatedView && ownershipView === "created") {
      setOwnershipView("assigned");
    }
  }, [ownershipView, showCreatedView]);

  useEffect(() => {
    if (viewMode === "columns" && folderFilter) return;
    setColumnPath((prev) => {
      const last = prev[prev.length - 1] ?? null;
      if (last === selectedColumnFolderId) return prev;
      if (!selectedColumnFolderId) return [];
      return [selectedColumnFolderId];
    });
  }, [folderFilter, selectedColumnFolderId, viewMode]);

  const userByUserId = useMemo(() => {
    const map = new Map<string, ScopedUserOption>();
    for (const u of users) {
      if (u.user_id) map.set(u.user_id, u);
    }
    return map;
  }, [users]);

  const getCreatorLabel = useCallback((ownerId?: string | null) => {
    const user = ownerId ? userByUserId.get(ownerId) : undefined;
    if (!user) {
      if (ownerId === viewerUserId && viewerUserName) return `${viewerUserName} - Admin Company`;
      return "Admin Company";
    }
    const fullName = `${user.first_name} ${user.last_name}`.trim();
    if (user.position_label) {
      return `${fullName} - ${user.position_label}`;
    }
    return `${fullName} - Admin Company`;
  }, [userByUserId, viewerUserId, viewerUserName]);

  const folderById = useMemo(() => new Map(folderRows.map((folder) => [folder.id, folder])), [folderRows]);

  const getEffectiveDocumentScope = useCallback((doc: DocumentRow) => {
    const ownScope = parseScope(doc.access_scope);
    if (!doc.folder_id || hasAnyScopeValue(ownScope)) return ownScope;
    return parseScope(folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope);
  }, [folderById]);


  const docsByFolder = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string | null, DocumentRow[]>();
    for (const doc of documentsState.filter((row) => {
      const isCreatedByViewer = row.owner_user_id === viewerUserId;
      if (ownershipView === "created" ? !isCreatedByViewer : isCreatedByViewer) return false;
      if (folderFilter) {
        let currentFolderId = row.folder_id;
        let withinSelectedTree = false;
        while (currentFolderId) {
          if (currentFolderId === folderFilter) {
            withinSelectedTree = true;
            break;
          }
          currentFolderId = folderById.get(currentFolderId)?.parent_id ?? null;
        }
        if (!withinSelectedTree) return false;
      }
      if (locationFilter && row.branch_id !== locationFilter) return false;
      if (departmentFilter) {
        const scope = getEffectiveDocumentScope(row);
        if (!scope.departments.includes(departmentFilter)) return false;
      }
      if (q && !row.title.toLowerCase().includes(q)) return false;
      return true;
    })) {
      const list = map.get(doc.folder_id) ?? [];
      list.push(doc);
      map.set(doc.folder_id, list);
    }
    return map;
  }, [departmentFilter, documentsState, folderById, folderFilter, getEffectiveDocumentScope, locationFilter, ownershipView, query, viewerUserId]);

  const childrenByFolder = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const folder of folderRows) {
      const list = map.get(folder.parent_id) ?? [];
      list.push(folder);
      map.set(folder.parent_id, list);
    }
    return map;
  }, [folderRows]);

  const folderParentById = useMemo(
    () => new Map(folderRows.map((folder) => [folder.id, folder.parent_id])),
    [folderRows],
  );

  const buildFolderPath = useCallback((folderId: string) => {
    const path: string[] = [];
    const visited = new Set<string>();
    let currentId: string | null = folderId;
    while (currentId && !visited.has(currentId)) {
      path.unshift(currentId);
      visited.add(currentId);
      currentId = folderParentById.get(currentId) ?? null;
    }
    return path;
  }, [folderParentById]);

  const ownedFolderIds = useMemo(
    () => new Set(folderRows.filter((folder) => folder.created_by === viewerUserId).map((folder) => folder.id)),
    [folderRows, viewerUserId],
  );

  const ownershipScopedFolderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const row of documentsState) {
      const isCreatedByViewer = row.owner_user_id === viewerUserId;
      if (ownershipView === "created" ? !isCreatedByViewer : isCreatedByViewer) continue;
      let currentId = row.folder_id;
      while (currentId) {
        ids.add(currentId);
        currentId = folderParentById.get(currentId) ?? null;
      }
    }
    if (ownershipView === "created") {
      for (const folderId of ownedFolderIds) {
        let currentId: string | null = folderId;
        while (currentId) {
          ids.add(currentId);
          currentId = folderParentById.get(currentId) ?? null;
        }
      }
    }
    return ids;
  }, [documentsState, folderParentById, getEffectiveDocumentScope, ownedFolderIds, ownershipView, viewerUserId]);

  const orderedFolderRows = useMemo(
    () => [...folderRows].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [folderRows],
  );

  const folderOptions = useMemo(
    () => orderedFolderRows
      .filter((folder) => ownershipScopedFolderIds.has(folder.id))
      .map((folder) => ({ id: folder.id, name: folder.name })),
    [orderedFolderRows, ownershipScopedFolderIds],
  );

  const sortDocuments = useCallback((rows: DocumentRow[]) => {
    return [...rows].sort((a, b) => {
      if (sortBy === "date-asc") return +new Date(a.created_at) - +new Date(b.created_at);
      if (sortBy === "name-asc") return a.title.localeCompare(b.title, "es");
      if (sortBy === "name-desc") return b.title.localeCompare(a.title, "es");
      if (sortBy === "size-desc") return (b.file_size_bytes ?? 0) - (a.file_size_bytes ?? 0);
      if (sortBy === "size-asc") return (a.file_size_bytes ?? 0) - (b.file_size_bytes ?? 0);
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [sortBy]);

  const filteredDocsByFolder = useMemo(() => {
    const map = new Map<string | null, DocumentRow[]>();
    for (const [folderId, rows] of docsByFolder.entries()) {
      map.set(folderId, sortDocuments(rows));
    }
    return map;
  }, [docsByFolder, sortDocuments]);

  const ownershipDocumentsCount = useMemo(() => {
    let total = 0;
    for (const rows of docsByFolder.values()) total += rows.length;
    return total;
  }, [docsByFolder]);

  const totalVisibleDocuments = useMemo(() => {
    let total = 0;
    for (const rows of filteredDocsByFolder.values()) total += rows.length;
    return total;
  }, [filteredDocsByFolder]);

  const visibleFolderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [folderId, rows] of filteredDocsByFolder.entries()) {
      if (!folderId || rows.length === 0) continue;
      let currentId: string | null = folderId;
      while (currentId) {
        ids.add(currentId);
        currentId = folderParentById.get(currentId) ?? null;
      }
    }

    if (ownershipView === "created") {
      for (const folderId of ownedFolderIds) {
        let currentId: string | null = folderId;
        while (currentId) {
          ids.add(currentId);
          currentId = folderParentById.get(currentId) ?? null;
        }
      }
    }

    if (folderFilter) {
      let currentId: string | null = folderFilter;
      while (currentId) {
        ids.add(currentId);
        currentId = folderParentById.get(currentId) ?? null;
      }
    }

    return ids;
  }, [filteredDocsByFolder, folderFilter, folderParentById, ownedFolderIds, ownershipView]);

  const visibleFolderRows = useMemo(
    () => orderedFolderRows.filter((folder) => visibleFolderIds.has(folder.id)),
    [orderedFolderRows, visibleFolderIds],
  );

  const folderDocumentCountById = useMemo(() => {
    const memo = new Map<string, number>();

    const computeCount = (folderId: string, visiting: Set<string>): number => {
      const cached = memo.get(folderId);
      if (typeof cached === "number") return cached;

      const ownDocumentsCount = (filteredDocsByFolder.get(folderId) ?? []).length;
      if (visiting.has(folderId)) return ownDocumentsCount;

      visiting.add(folderId);
      let total = ownDocumentsCount;

      for (const child of childrenByFolder.get(folderId) ?? []) {
        if (!visibleFolderIds.has(child.id)) continue;
        total += computeCount(child.id, visiting);
      }

      visiting.delete(folderId);
      memo.set(folderId, total);
      return total;
    };

    for (const folder of visibleFolderRows) {
      computeCount(folder.id, new Set<string>());
    }

    return memo;
  }, [childrenByFolder, filteredDocsByFolder, visibleFolderIds, visibleFolderRows]);

  function renderFolderTree(parentId: string | null, depth = 0) {
    const folderList = childrenByFolder.get(parentId) ?? [];
    return folderList.flatMap((folder) => {
      if (!visibleFolderIds.has(folder.id)) return [];
      const docList = filteredDocsByFolder.get(folder.id) ?? [];

      const isOpen = openFolders.has(folder.id);

      const row = (
        <div key={folder.id}>
          <div className="border-b border-[var(--gbp-border)]">
            <div
              className={`flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)] ${dropFolderId === folder.id ? "bg-[var(--gbp-accent-glow)] ring-1 ring-inset ring-[var(--gbp-accent)]" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setDropFolderId(folder.id);
                setDropRootColumn(false);
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                setDropFolderId((prev) => (prev === folder.id ? null : prev));
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const droppedDocId = event.dataTransfer.getData("application/x-document-id") || (dragMetaRef.current.kind === "document" ? dragMetaRef.current.id : null) || draggedDocumentId;
                const droppedFolderId = event.dataTransfer.getData("application/x-folder-id") || (dragMetaRef.current.kind === "folder" ? dragMetaRef.current.id : null) || draggedFolderId;
                logDnd("drop-folder-tree", { targetFolderId: folder.id, droppedDocId, droppedFolderId });
                if (droppedDocId) {
                  void moveDocumentToFolder(droppedDocId, folder.id);
                  return;
                }
                if (droppedFolderId && droppedFolderId !== folder.id) {
                  void moveFolderToFolder(droppedFolderId, folder.id);
                }
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  setOpenFolders((prev) => {
                    const next = new Set(prev);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setOpenFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    });
                  }
                }}
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
                style={{ paddingLeft: `${depth * 20}px` }}
                draggable={isFolderOwner(folder)}
                onDragStart={(event) => {
                  if (!isFolderOwner(folder)) return;
                  dragMetaRef.current = { kind: "folder", id: folder.id };
                  event.dataTransfer.setData("application/x-folder-id", folder.id);
                  event.dataTransfer.effectAllowed = "move";
                  markDndActive();
                  logDnd("dragstart-folder-tree", { folderId: folder.id });
                }}
                onDragEnd={resetDndState}
              >
                <ChevronRight className={`h-4 w-4 text-[var(--gbp-text2)] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-5 w-5 text-[var(--gbp-text2)]" />
                <span className="truncate text-sm font-semibold text-[var(--gbp-text)]">
                  {folder.name}
                </span>
                <span className="text-xs text-[var(--gbp-muted)]">({folderDocumentCountById.get(folder.id) ?? 0})</span>
              </div>
            </div>
            
            {isOpen && (
              <div>
                <div className="border-l-[3px] border-[var(--gbp-border)]">
                  {docList.map((doc) => (
                    <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable={isOwner(doc)} onDragStart={(event) => { if (!isOwner(doc)) return; dragMetaRef.current = { kind: "document", id: doc.id }; event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; markDndActive(); logDnd("dragstart-doc-tree-nested", { documentId: doc.id }); }} onDragEnd={resetDndState}>
                      <div className="min-w-0 flex-1 flex items-center gap-3" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                         <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-lg">📄</div>
                         <div className="min-w-0">
                           <p className="truncate text-sm font-bold text-[var(--gbp-text)]">
                             {doc.title}
                             {doc.is_new ? <span className="ml-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-success)]">NUEVO</span> : null}
                           </p>
                           <p className="truncate text-xs text-[var(--gbp-muted)]">
                             Subido por {getCreatorLabel(doc.owner_user_id)}
                           </p>
                         </div>
                      </div>
                      <EmployeeDocumentActions
                        documentId={doc.id}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        isOwner={isOwner(doc)}
                        onEdit={() => setEditingDocument(doc)}
                        onDelete={() => setDeleteDocument(doc)}
                        labelMode="responsive"
                      />
                    </div>
                  ))}
                  {renderFolderTree(folder.id, depth + 1)}
                </div>
              </div>
            )}
          </div>
        </div>
      );

      return [row];
    });
  }

  const rootDocuments = filteredDocsByFolder.get(null) ?? [];

  const folderColumns = useMemo(() => {
    const levels: Array<{ parentId: string | null; folders: FolderRow[]; documents: DocumentRow[]; selectedFolderId: string | null }> = [];
    const depth = columnPath.length;
    for (let index = 0; index <= depth; index += 1) {
      const parentId = index === 0 ? null : columnPath[index - 1] ?? null;
      const selectedFolderId = columnPath[index] ?? null;
      const foldersAtLevel = [...(childrenByFolder.get(parentId) ?? [])]
        .filter((folder) => visibleFolderIds.has(folder.id))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      const documentsAtLevel = filteredDocsByFolder.get(parentId) ?? [];
      levels.push({ parentId, folders: foldersAtLevel, documents: documentsAtLevel, selectedFolderId });
    }
    return levels;
  }, [childrenByFolder, columnPath, filteredDocsByFolder, visibleFolderIds]);

  const selectedColumnDocument = useMemo(
    () => documentsState.find((doc) => doc.id === selectedColumnDocId) ?? null,
    [documentsState, selectedColumnDocId],
  );

  useEffect(() => {
    const validFolderIds = new Set(visibleFolderRows.map((folder) => folder.id));
    setColumnPath((prev) => prev.filter((folderId) => validFolderIds.has(folderId)));
  }, [visibleFolderRows]);

  useEffect(() => {
    if (viewMode !== "columns") return;
    if (!folderFilter) {
      setColumnPath([]);
      return;
    }
    setColumnPath(buildFolderPath(folderFilter));
    setSelectedColumnFolderId(folderFilter);
    setSelectedColumnDocId(null);
  }, [buildFolderPath, folderFilter, setSelectedColumnFolderId, viewMode]);

  useEffect(() => {
    if (!folderFilter) return;
    if (folderOptions.some((option) => option.id === folderFilter)) return;
    setFolderFilter("");
  }, [folderFilter, folderOptions]);

  useEffect(() => {
    const last = columnPath[columnPath.length - 1] ?? null;
    setSelectedColumnFolderId((prev) => (prev === last ? prev : last));
  }, [columnPath, setSelectedColumnFolderId]);

  useEffect(() => {
    if (viewMode !== "columns") return;
    const totalColumns = folderColumns.length + (selectedColumnDocument ? 1 : 0);
    const grew = totalColumns > previousColumnCountRef.current;
    previousColumnCountRef.current = totalColumns;
    if (!grew) return;

    const frame = window.requestAnimationFrame(() => {
      const container = columnsScrollRef.current;
      if (!container) return;
      container.scrollTo({ left: container.scrollWidth, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [folderColumns.length, selectedColumnDocument, viewMode]);

  useEffect(() => {
    if (viewMode !== "columns") return;
    if (!selectedColumnDocId) return;
    const existsInVisibleColumns = folderColumns.some((column) => column.documents.some((doc) => doc.id === selectedColumnDocId));
    if (!existsInVisibleColumns) {
      setSelectedColumnDocId(null);
    }
  }, [folderColumns, selectedColumnDocId, viewMode]);

  const isOwner = (doc: DocumentRow) => doc.owner_user_id === viewerUserId;
  const isFolderOwner = (folder: FolderRow) => folder.created_by === viewerUserId;

  async function moveDocumentToFolder(documentId: string, targetFolderId: string | null) {
    const doc = documentsState.find((row) => row.id === documentId);
    if (!doc || !isOwner(doc)) {
      resetDndState();
      return;
    }
    // No hacer nada si ya está en la misma carpeta
    if (doc.folder_id === targetFolderId) {
      resetDndState();
      return;
    }
    const targetFolderName = targetFolderId
      ? folderRows.find((f) => f.id === targetFolderId)?.name ?? "carpeta"
      : "raíz";

    const movePromise = (async () => {
      logDnd("move-document:start", { documentId, targetFolderId });
      setPreviewState((prev) => (prev.docId === documentId ? { ...prev, status: "idle" } : prev));
      const response = await fetch("/api/employee/documents/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, folderId: targetFolderId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; folderId?: string | null };
      if (!response.ok) throw new Error(data.error || "No se pudo mover el documento");
      const resolvedFolderId = data.folderId === undefined ? targetFolderId : data.folderId;
      logDnd("move-document:ok", { documentId, targetFolderId });
      setDocumentsState((prev) => prev.map((row) => (row.id === documentId ? { ...row, folder_id: resolvedFolderId } : row)));
      router.refresh();
      return { targetFolderName };
    })();

    toast.promise(movePromise, {
      loading: `Moviendo documento a "${targetFolderName}"…`,
      success: () => `Documento movido a "${targetFolderName}"`,
      error: (err) => (err instanceof Error ? err.message : "Error moviendo documento"),
    });

    movePromise.catch(() => {}).finally(() => {
      dragMetaRef.current = { kind: null, id: null };
      setDropFolderId(null);
      setDropRootColumn(false);
      setDropColumnTargetId(null);
      setDraggedDocumentId(null);
      setDraggedFolderId(null);
    });
  }

  async function moveFolderToFolder(folderId: string, targetFolderId: string | null) {
    const folder = folderRows.find((row) => row.id === folderId);
    if (!folder || !isFolderOwner(folder)) {
      resetDndState();
      return;
    }
    if (folderId === targetFolderId) {
      resetDndState();
      return;
    }
    // No hacer nada si ya está en el mismo contenedor padre
    if (folder.parent_id === targetFolderId) {
      resetDndState();
      return;
    }
    if (targetFolderId) {
      const parentById = new Map(folderRows.map((row) => [row.id, row.parent_id]));
      let currentParentId = parentById.get(targetFolderId) ?? null;
      while (currentParentId) {
        if (currentParentId === folderId) {
          toast.error("No puedes mover una carpeta dentro de una subcarpeta suya");
          resetDndState();
          return;
        }
        currentParentId = parentById.get(currentParentId) ?? null;
      }
    }
    // Optimistic update
    setFolderRows((prev) => prev.map((row) => (row.id === folderId ? { ...row, parent_id: targetFolderId } : row)));

    const targetFolderName = targetFolderId
      ? folderRows.find((f) => f.id === targetFolderId)?.name ?? "carpeta"
      : "raíz";

    const movePromise = (async () => {
      logDnd("move-folder:start", { folderId, targetFolderId });
      const response = await fetch("/api/employee/document-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, parentId: targetFolderId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; parentId?: string | null };
      if (!response.ok) {
        // Revert on error
        setFolderRows((prev) => prev.map((row) => (row.id === folderId ? { ...row, parent_id: folder.parent_id } : row)));
        throw new Error(data.error || "No se pudo mover la carpeta");
      }
      if (data.parentId !== undefined) {
        const resolvedParentId = data.parentId ?? null;
        setFolderRows((prev) => prev.map((row) => (row.id === folderId ? { ...row, parent_id: resolvedParentId } : row)));
      }
      logDnd("move-folder:ok", { folderId, targetFolderId });
      router.refresh();
      return { targetFolderName };
    })();

    toast.promise(movePromise, {
      loading: `Moviendo carpeta a "${targetFolderName}"…`,
      success: () => `Carpeta movida a "${targetFolderName}"`,
      error: (err) => (err instanceof Error ? err.message : "Error moviendo carpeta"),
    });

    movePromise.catch(() => {}).finally(() => {
      resetDndState();
    });
  }

  const noDocumentsTitle = ownershipView === "created" ? "Aún no cargaste documentos" : "Sin documentos asignados";
  const noDocumentsDescription = ownershipView === "created"
    ? "Todavía no cargaste documentos en este módulo."
    : "No hay documentos visibles para tu perfil en este momento.";

  const noResultsLabel = `No se encontraron resultados para \"${query}\" en ${ownershipView === "created" ? "Cargados" : "Asignados"}.`;
  const hasOwnershipContent = ownershipDocumentsCount > 0 || (ownershipView === "created" && ownedFolderIds.size > 0);
  const isDraggingColumnsItem = Boolean(dragMetaRef.current.kind);
  const handleViewModeChange = useCallback((next: "tree" | "columns") => {
    setViewMode(next);
    trackDocumentViewModeChange({
      scope: "employee",
      mode: next,
      organizationId,
      userId: viewerUserId,
    });
  }, [organizationId, setViewMode, viewerUserId]);

  return (
    <>
      <OperationHeaderCard
        eyebrow="Operación diaria"
        title="Mis Documentos"
        description="Explora y gestiona los documentos operativos que tienes asignados o cargados según tu perfil."
        action={(
          <div className="flex flex-wrap gap-2">
            <DocumentViewModeToggle
              viewMode={viewMode}
              onChange={handleViewModeChange}
              testIdPrefix="portal-documents-view"
            />
            {canCreate ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(true)}
                  disabled={busy}
                  className="inline-flex h-[33px] items-center gap-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-70"
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Nueva Carpeta
                </button>
                <button
                  type="button"
                  onClick={() => setIsUploadModalOpen(true)}
                  disabled={busy}
                  className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-3 text-xs font-bold text-white disabled:opacity-70"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  Subir Archivo
                </button>
              </>
            ) : null}
          </div>
        )}
      />

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Buscar documentos..."
        searchTestId="employee-documents-search-input"
        filters={[
          {
            key: "folder",
            options: folderOptions.map((f) => ({ id: f.id, label: f.name })),
            value: folderFilter,
            onChange: setFolderFilter,
            allLabel: "Todas las carpetas",
            testId: "documents-filter-folder",
          },
          {
            key: "location",
            options: branches.map((b) => ({ id: b.id, label: b.name })),
            value: locationFilter,
            onChange: setLocationFilter,
            allLabel: "Todas las locaciones",
            testId: "documents-filter-location",
          },
          {
            key: "department",
            options: departments.map((d) => ({ id: d.id, label: d.name })),
            value: departmentFilter,
            onChange: setDepartmentFilter,
            allLabel: "Todos los departamentos",
            testId: "documents-filter-department",
          },
        ]}
        hasActiveFilters={Boolean(query || locationFilter || departmentFilter || folderFilter)}
        onClearFilters={() => {
          setQuery("");
          setLocationFilter("");
          setDepartmentFilter("");
          setFolderFilter("");
          setColumnPath([]);
          setSelectedColumnDocId(null);
        }}
      />

      <AssignedCreatedToggle
        viewMode={ownershipView}
        onChange={setOwnershipView}
        showCreated={showCreatedView}
        assignedLabel="Asignados"
        createdLabel="Cargados"
        variant="header"
      />

      {!hasOwnershipContent ? (
        <EmptyState title={noDocumentsTitle} description={noDocumentsDescription} />
      ) : (
        <div>
          <div>
              {viewMode === "tree" ? (
                <section data-testid="portal-documents-tree-root" className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                  <div className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs font-bold uppercase tracking-[0.07em] text-[var(--gbp-muted)]">
                    Explorador de Archivos
                  </div>
                  <div
                    onDragOver={(event) => { event.preventDefault(); setDropRootColumn(true); }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                      setDropRootColumn(false);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const droppedDocId = event.dataTransfer.getData("application/x-document-id") || (dragMetaRef.current.kind === "document" ? dragMetaRef.current.id : null) || draggedDocumentId;
                      const droppedFolderId = event.dataTransfer.getData("application/x-folder-id") || (dragMetaRef.current.kind === "folder" ? dragMetaRef.current.id : null) || draggedFolderId;
                      logDnd("drop-tree-root", { droppedDocId, droppedFolderId });
                      if (droppedDocId) {
                        void moveDocumentToFolder(droppedDocId, null);
                        return;
                      }
                      if (droppedFolderId) {
                        void moveFolderToFolder(droppedFolderId, null);
                      }
                    }}
                  >
                    {totalVisibleDocuments === 0 && query.trim() ? (
                      <div className="p-8 text-center text-sm text-[var(--gbp-text2)]">{noResultsLabel}</div>
                    ) : (
                      <>
                        {isDraggingColumnsItem ? (
                          <div className={`mx-3 mt-3 rounded-lg border border-dashed px-3 py-2 text-center text-xs transition-colors ${
                            dropRootColumn
                              ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                              : "border-[var(--gbp-border2)] text-[var(--gbp-muted)]"
                          }`}>
                            Soltar aquí para mover a la raíz
                          </div>
                        ) : null}
                        {renderFolderTree(null)}
                        {rootDocuments.map((doc) => (
                            <div key={doc.id}>
                              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable={isOwner(doc)} onDragStart={(event) => { if (!isOwner(doc)) return; dragMetaRef.current = { kind: "document", id: doc.id }; event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; markDndActive(); logDnd("dragstart-doc-tree-root", { documentId: doc.id }); }} onDragEnd={resetDndState}>
                                <div className="min-w-0 flex-1 flex items-center gap-3">
                                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-lg">📄</div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[var(--gbp-text)]">
                                      {doc.title}
                                      {doc.is_new ? <span className="ml-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-success)]">NUEVO</span> : null}
                                    </p>
                                    <p className="truncate text-xs text-[var(--gbp-muted)]">
                                      Subido por {getCreatorLabel(doc.owner_user_id)}
                                    </p>
                                  </div>
                                </div>
                                <EmployeeDocumentActions
                                  documentId={doc.id}
                                  canEdit={canEdit}
                                  canDelete={canDelete}
                                  isOwner={isOwner(doc)}
                                  onEdit={() => setEditingDocument(doc)}
                                  onDelete={() => setDeleteDocument(doc)}
                                  labelMode="responsive"
                                />
                              </div>
                            </div>
                          ))}
                      </>
                    )}
                  </div>
                </section>
              ) : (
                <section data-testid="portal-documents-columns-root" className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                  <div ref={columnsScrollRef} className="overflow-x-auto">
                    <div className="flex min-h-[560px] divide-x divide-[var(--gbp-border)]">
                      {folderColumns.map((column, index) => {
                        const parentFolder = column.parentId ? (folderById.get(column.parentId) ?? null) : null;
                        const isRootColumn = index === 0;
                        return (
                          <div
                            key={`col-${index}-${column.parentId ?? "root"}`}
                            className="w-[300px] shrink-0 bg-[var(--gbp-bg)] p-3"
                            onDragOver={(event) => {
                              event.preventDefault();
                              if (isRootColumn) {
                                setDropRootColumn(true);
                              } else {
                                setDropColumnTargetId(column.parentId ?? null);
                              }
                              setDropFolderId(null);
                            }}
                            onDragLeave={(event) => {
                              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                              if (isRootColumn) {
                                setDropRootColumn(false);
                              } else {
                                setDropColumnTargetId((prev) => (prev === (column.parentId ?? null) ? null : prev));
                              }
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setDropRootColumn(false);
                              setDropColumnTargetId(null);
                              const droppedDocId = event.dataTransfer.getData("application/x-document-id") || event.dataTransfer.getData("text/plain") || (dragMetaRef.current.kind === "document" ? dragMetaRef.current.id : null) || draggedDocumentId;
                              const droppedFolderId = event.dataTransfer.getData("application/x-folder-id") || (dragMetaRef.current.kind === "folder" ? dragMetaRef.current.id : null) || draggedFolderId;
                              logDnd("drop-column", { parentId: column.parentId ?? null, droppedDocId, droppedFolderId });
                              if (droppedFolderId) {
                                void moveFolderToFolder(droppedFolderId, column.parentId ?? null);
                                return;
                              }
                              if (!droppedDocId) return;
                              void moveDocumentToFolder(droppedDocId, column.parentId ?? null);
                            }}
                          >
                            <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">
                              {isRootColumn ? "Principal" : parentFolder?.name ?? "Carpeta"}
                            </p>
                            {isDraggingColumnsItem ? (
                              <div
                                className={`pointer-events-none mb-2 rounded-lg border border-dashed px-3 py-2 text-center text-xs transition-colors ${
                                  isRootColumn
                                    ? dropRootColumn
                                      ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                                      : "border-[var(--gbp-border2)] text-[var(--gbp-muted)]"
                                    : dropColumnTargetId === (column.parentId ?? null)
                                      ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                                      : "border-[var(--gbp-border2)] text-[var(--gbp-muted)]"
                                }`}
                              >
                                {isRootColumn ? "Soltar aquí para mover a Principal" : `Soltar aquí para mover a ${parentFolder?.name ?? "carpeta"}`}
                              </div>
                            ) : null}
                            <div className="space-y-1">
                              {column.folders.map((folder) => (
                                <div
                                  key={folder.id}
                                  role="button"
                                  tabIndex={0}
                                  draggable={isFolderOwner(folder)}
                                  onDragStart={(event) => {
                                    if (!isFolderOwner(folder)) return;
                                    suppressColumnClickRef.current = true;
                                    dragMetaRef.current = { kind: "folder", id: folder.id };
                                    event.dataTransfer.setData("application/x-folder-id", folder.id);
                                    event.dataTransfer.setData("text/plain", folder.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    markDndActive();
                                    logDnd("dragstart-folder", { folderId: folder.id, columnParentId: column.parentId ?? null });
                                  }}
                                  onDragEnd={() => {
                                    logDnd("dragend-folder", { folderId: folder.id });
                                    resetDndState();
                                    window.setTimeout(() => {
                                      suppressColumnClickRef.current = false;
                                    }, 0);
                                  }}
                                  onClick={() => {
                                    if (suppressColumnClickRef.current) {
                                      suppressColumnClickRef.current = false;
                                      return;
                                    }
                                    setColumnPath((prev) => {
                                      const next = prev.slice(0, index);
                                      next[index] = folder.id;
                                      return next;
                                    });
                                    setSelectedColumnDocId(null);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setColumnPath((prev) => {
                                        const next = prev.slice(0, index);
                                        next[index] = folder.id;
                                        return next;
                                      });
                                      setSelectedColumnDocId(null);
                                    }
                                  }}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDropFolderId(folder.id);
                                    setDropRootColumn(false);
                                    setDropColumnTargetId(null);
                                  }}
                                  onDragLeave={() => setDropFolderId((prev) => (prev === folder.id ? null : prev))}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setDropFolderId(null);
                                    const droppedDocId = event.dataTransfer.getData("application/x-document-id") || event.dataTransfer.getData("text/plain") || (dragMetaRef.current.kind === "document" ? dragMetaRef.current.id : null) || draggedDocumentId;
                                    const droppedFolderId = event.dataTransfer.getData("application/x-folder-id") || (dragMetaRef.current.kind === "folder" ? dragMetaRef.current.id : null) || draggedFolderId;
                                    logDnd("drop-folder-target", { targetFolderId: folder.id, droppedDocId, droppedFolderId });
                                    if (droppedFolderId && droppedFolderId !== folder.id) {
                                      void moveFolderToFolder(droppedFolderId, folder.id);
                                      return;
                                    }
                                    const draggedDocId = droppedDocId;
                                    if (!draggedDocId) return;
                                    void moveDocumentToFolder(draggedDocId, folder.id);
                                  }}
                                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left cursor-pointer ${dropFolderId === folder.id || column.selectedFolderId === folder.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${isFolderOwner(folder) ? "cursor-grab text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text2)] active:cursor-grabbing" : "cursor-not-allowed text-[var(--gbp-border2)]"}`}
                                      title={isFolderOwner(folder) ? "Arrastrar carpeta" : "Solo puedes mover carpetas que creaste"}
                                    >
                                      <GripVertical className="h-3.5 w-3.5" />
                                    </span>
                                    <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--gbp-text2)]" />
                                    <span className="flex items-center truncate text-sm font-medium text-[var(--gbp-text)]">
                                      {folder.name}
                                    </span>
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--gbp-muted)]" />
                                </div>
                              ))}

                              {column.documents.map((doc) => (
                                <div
                                  key={doc.id}
                                  role="button"
                                  tabIndex={0}
                                  draggable={isOwner(doc)}
                                  onDragStart={(event) => {
                                    if (!isOwner(doc)) return;
                                    suppressColumnClickRef.current = true;
                                    dragMetaRef.current = { kind: "document", id: doc.id };
                                    event.dataTransfer.setData("application/x-document-id", doc.id);
                                    event.dataTransfer.setData("text/plain", doc.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    markDndActive();
                                    logDnd("dragstart-document", { documentId: doc.id, columnParentId: column.parentId ?? null });
                                  }}
                                  onDragEnd={() => {
                                    logDnd("dragend-document", { documentId: doc.id });
                                    resetDndState();
                                    window.setTimeout(() => {
                                      suppressColumnClickRef.current = false;
                                    }, 0);
                                  }}
                                  onClick={() => {
                                    if (suppressColumnClickRef.current) {
                                      suppressColumnClickRef.current = false;
                                      return;
                                    }
                                    setSelectedColumnDocId(doc.id);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setSelectedColumnDocId(doc.id);
                                    }
                                  }}
                                  className={`w-full rounded-lg border px-3 py-2 text-left cursor-pointer ${selectedColumnDocId === doc.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${isOwner(doc) ? "cursor-grab text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text2)] active:cursor-grabbing" : "cursor-not-allowed text-[var(--gbp-border2)]"}`}
                                      title={isOwner(doc) ? "Arrastrar archivo" : "Solo puedes mover archivos que subiste"}
                                    >
                                      <GripVertical className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="flex items-center truncate text-sm font-semibold text-[var(--gbp-text)]">
                                      {doc.title}
                                    </span>
                                  </span>
                                  <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">
                                    Subido por {getCreatorLabel(doc.owner_user_id)}
                                  </p>
                                </div>
                              ))}

                              {column.folders.length === 0 && column.documents.length === 0 ? (
                                <p className="rounded-lg border border-dashed border-[var(--gbp-border2)] px-3 py-8 text-center text-sm text-[var(--gbp-muted)]">
                                  Sin resultados en esta columna.
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}

                      {selectedColumnDocument ? (
                        <div className="w-[360px] shrink-0 bg-[var(--gbp-surface)] p-3">
                          <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Detalle</p>
                          <div className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                            <div>
                              <p className="flex items-center text-sm font-semibold text-[var(--gbp-text)]">
                                {selectedColumnDocument.title}
                              </p>
                              <p className="mt-1 text-xs text-[var(--gbp-text2)]">Subido por {getCreatorLabel(selectedColumnDocument.owner_user_id)}</p>
                            </div>
                            <EmployeeDocumentActions
                              documentId={selectedColumnDocument.id}
                              canEdit={canEdit}
                              canDelete={canDelete}
                              isOwner={isOwner(selectedColumnDocument)}
                              onEdit={() => setEditingDocument(selectedColumnDocument)}
                              onDelete={() => setDeleteDocument(selectedColumnDocument)}
                              labelMode="full"
                            />
                            <DocumentPreviewPanel
                              document={selectedColumnDocument}
                              previewState={previewState}
                              setPreviewState={setPreviewState}
                              isPreviewableMime={isPreviewableMime}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>
              )}
          </div>
        </div>
      )}

      {isUploadModalOpen ? (
        <UploadDocumentModal
          onClose={() => setIsUploadModalOpen(false)}
          folders={folders.filter((folder) => isFolderOwner(folder)).map((folder) => ({ id: folder.id, name: folder.name }))}
          branches={branches}
          departments={departments}
          positions={positions}
          employees={users}
          recentDocuments={recentDocuments}
          submitEndpoint="/api/employee/documents/manage"
          redirectPath="/portal/documents"
          allowedLocationIds={allowedLocationIds}
          lockLocationSelection
        />
      ) : null}

      {isFolderModalOpen ? (
        <DocumentFolderModal
          onClose={() => setIsFolderModalOpen(false)}
          folders={folders.filter((folder) => isFolderOwner(folder)).map((folder) => ({ id: folder.id, name: folder.name }))}
          branches={branches}
          departments={departments}
          positions={positions}
          employees={users}
          submitEndpoint="/api/employee/document-folders"
          redirectPath="/portal/documents"
          allowedLocationIds={allowedLocationIds}
          lockLocationSelection
        />
      ) : null}

      {editingDocument ? (
        <EmployeeDocumentEditModal
          title={editingDocument.title}
          initialValue={editingDocument.title}
          busy={busy}
          onCancel={() => setEditingDocument(null)}
          onSave={(nextTitle) => void renameDocument(editingDocument, nextTitle)}
        />
      ) : null}

      {deleteDocument ? (
        <ConfirmDeleteDialog
          title="Eliminar documento"
          description={`Se eliminará \"${deleteDocument.title}\". Esta acción no se puede deshacer.`}
          busy={busy}
          onCancel={() => setDeleteDocument(null)}
          onConfirm={() => void deleteDocumentById(deleteDocument)}
          confirmLabel="Eliminar"
        />
      ) : null}


    </>
  );
}
