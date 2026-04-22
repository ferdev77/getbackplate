"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ChevronRight, Folder, GripVertical, UploadCloud, FolderPlus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FadeIn, SlideUp, AnimatedItem } from "@/shared/ui/animations";
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
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";

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
    return { departments: [] as string[] };
  }
  const value = scope as Record<string, unknown>;
  return {
    departments: Array.isArray(value.department_ids)
      ? value.department_ids.filter((x): x is string => typeof x === "string")
      : [],
  };
}

type Props = {
  organizationId: string;
  viewerUserId: string;
  folders: FolderRow[];
  documents: DocumentRow[];
  initialViewMode?: "tree" | "columns";
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  branches?: BranchOption[];
  departments?: DepartmentOption[];
  positions?: PositionOption[];
  users?: ScopedUserOption[];
  recentDocuments?: Array<{ id: string; title: string; branch_id: string | null; created_at: string }>;
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
  folders,
  documents,
  initialViewMode = "tree",
  canCreate = false,
  canEdit = false,
  canDelete = false,
  branches = [],
  departments = [],
  positions = [],
  users = [],
  recentDocuments = [],
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
  }

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

  useEffect(() => {
    setDocumentsState(documents);
  }, [documents]);

  useEffect(() => {
    setFolderRows(folders);
  }, [folders]);

  useEffect(() => {
    setColumnPath((prev) => {
      const last = prev[prev.length - 1] ?? null;
      if (last === selectedColumnFolderId) return prev;
      if (!selectedColumnFolderId) return [];
      return [selectedColumnFolderId];
    });
  }, [selectedColumnFolderId]);

  const folderById = useMemo(() => new Map(folderRows.map((folder) => [folder.id, folder])), [folderRows]);
  const folderOptions = useMemo(() => folderRows.map((folder) => ({ id: folder.id, name: folder.name })), [folderRows]);

  const getEffectiveDocumentScope = useCallback((doc: DocumentRow) => {
    if (!doc.folder_id) return parseScope(doc.access_scope);
    return parseScope(folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope);
  }, [folderById]);

  const docsByFolder = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string | null, DocumentRow[]>();
    for (const doc of documentsState.filter((row) => {
      const own = row.owner_user_id === viewerUserId;
      if (ownershipView === "created" ? !own : own) return false;
      if (folderFilter && row.folder_id !== folderFilter) return false;
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
  }, [departmentFilter, documentsState, folderFilter, getEffectiveDocumentScope, locationFilter, ownershipView, query, viewerUserId]);

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

  const ownedFolderIds = useMemo(
    () => new Set(folderRows.filter((folder) => folder.created_by === viewerUserId).map((folder) => folder.id)),
    [folderRows, viewerUserId],
  );

  const orderedFolderRows = useMemo(
    () => [...folderRows].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [folderRows],
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
        <AnimatedItem key={folder.id}>
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
              <button
                type="button"
                onClick={() =>
                  setOpenFolders((prev) => {
                    const next = new Set(prev);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  })
                }
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                style={{ paddingLeft: `${depth * 20}px` }}
                draggable={isFolderOwner(folder)}
                onDragStart={(event) => {
                  if (!isFolderOwner(folder)) return;
                  dragMetaRef.current = { kind: "folder", id: folder.id };
                  event.dataTransfer.setData("application/x-folder-id", folder.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedFolderId(folder.id);
                  setDraggedDocumentId(null);
                  setDropRootColumn(false);
                  setDropColumnTargetId(null);
                  logDnd("dragstart-folder-tree", { folderId: folder.id });
                }}
                onDragEnd={resetDndState}
              >
                <ChevronRight className={`h-4 w-4 text-[var(--gbp-text2)] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-5 w-5 text-[var(--gbp-text2)]" />
                <span className="truncate text-sm font-semibold text-[var(--gbp-text)]">{folder.name}</span>
                <span className="text-xs text-[var(--gbp-muted)]">({folderDocumentCountById.get(folder.id) ?? 0})</span>
              </button>
            </div>
            
            <AnimatePresence>
              {isOpen && (
                <FadeIn delay={0.05}>
                  <div className="border-l-[3px] border-[var(--gbp-border)]">
                    {docList.map((doc) => (
                      <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable={isOwner(doc)} onDragStart={(event) => { if (!isOwner(doc)) return; dragMetaRef.current = { kind: "document", id: doc.id }; event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; setDraggedDocumentId(doc.id); setDraggedFolderId(null); setDropRootColumn(false); setDropColumnTargetId(null); logDnd("dragstart-doc-tree-nested", { documentId: doc.id }); }} onDragEnd={resetDndState}>
                        <div className="min-w-0 flex-1 flex items-center gap-3" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                           <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-lg">📄</div>
                           <div className="min-w-0">
                             <p className="truncate text-sm font-bold text-[var(--gbp-text)]">
                               {doc.title}
                               {doc.is_new ? <span className="ml-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-success)]">NUEVO</span> : null}
                             </p>
                             <p className="truncate text-xs text-[var(--gbp-muted)]">
                               {formatSize(doc.file_size_bytes)} · {(doc.mime_type ?? "archivo").toUpperCase()}
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
                </FadeIn>
              )}
            </AnimatePresence>
          </div>
        </AnimatedItem>
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
      return;
    }
    try {
      logDnd("move-document:start", { documentId, targetFolderId });
      setPreviewState((prev) => (prev.docId === documentId ? { ...prev, status: "idle" } : prev));
      const response = await fetch("/api/employee/documents/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, folderId: targetFolderId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo mover el documento");
      logDnd("move-document:ok", { documentId, targetFolderId });
      setDocumentsState((prev) => prev.map((row) => (row.id === documentId ? { ...row, folder_id: targetFolderId } : row)));
      router.refresh();
    } catch (error) {
      logDnd("move-document:error", { documentId, targetFolderId, error: error instanceof Error ? error.message : String(error) });
      console.error(error);
    } finally {
      dragMetaRef.current = { kind: null, id: null };
      setDropFolderId(null);
      setDropRootColumn(false);
      setDropColumnTargetId(null);
      setDraggedDocumentId(null);
      setDraggedFolderId(null);
    }
  }

  async function moveFolderToFolder(folderId: string, targetFolderId: string | null) {
    const folder = folderRows.find((row) => row.id === folderId);
    if (!folder || !isFolderOwner(folder)) {
      return;
    }
    if (folderId === targetFolderId) {
      return;
    }
    if (targetFolderId) {
      const parentById = new Map(folderRows.map((row) => [row.id, row.parent_id]));
      let currentParentId = parentById.get(targetFolderId) ?? null;
      while (currentParentId) {
        if (currentParentId === folderId) {
          return;
        }
        currentParentId = parentById.get(currentParentId) ?? null;
      }
    }
    // Optimistic update
    setFolderRows((prev) => prev.map((row) => (row.id === folderId ? { ...row, parent_id: targetFolderId } : row)));
    try {
      logDnd("move-folder:start", { folderId, targetFolderId });
      const response = await fetch("/api/employee/document-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, parentId: targetFolderId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Revert on error
        setFolderRows((prev) => prev.map((row) => (row.id === folderId ? { ...row, parent_id: folder.parent_id } : row)));
        throw new Error(data.error || "No se pudo mover la carpeta");
      }
      logDnd("move-folder:ok", { folderId, targetFolderId });
      router.refresh();
    } catch (error) {
      logDnd("move-folder:error", { folderId, targetFolderId, error: error instanceof Error ? error.message : String(error) });
      console.error(error);
    } finally {
      resetDndState();
    }
  }

  const noDocumentsTitle = ownershipView === "created" ? "Aún no subiste documentos" : "Sin documentos asignados";
  const noDocumentsDescription = ownershipView === "created"
    ? "Todavía no subiste documentos en este módulo."
    : "No hay documentos visibles para tu perfil en este momento.";

  const noResultsLabel = `No se encontraron resultados para \"${query}\" en ${ownershipView === "created" ? "Subidos" : "Asignados"}.`;
  const hasOwnershipContent = ownershipDocumentsCount > 0 || (ownershipView === "created" && ownedFolderIds.size > 0);
  const isDraggingColumnsItem = Boolean(draggedDocumentId || draggedFolderId);
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
        description="Explora y gestiona los documentos operativos que tienes asignados o subidos según tu perfil."
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

      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gbp-muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-[34px] w-[220px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] pl-9 pr-3 text-xs" placeholder="Buscar documentos..." />
        </div>
        {viewMode === "tree" ? (
          <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="">Todas las carpetas</option>{folderOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        ) : null}
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="">Todas las ubicaciones</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="">Todos los departamentos</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="date-desc">Más recientes primero</option><option value="date-asc">Más antiguos primero</option><option value="name-asc">Nombre A-Z</option><option value="name-desc">Nombre Z-A</option><option value="size-desc">Mayor tamaño</option><option value="size-asc">Menor tamaño</option></select>
      </section>

      <AssignedCreatedToggle
        viewMode={ownershipView}
        onChange={setOwnershipView}
        assignedLabel="Asignados"
        createdLabel="Subidos"
        variant="header"
      />

      {!hasOwnershipContent ? (
        <EmptyState title={noDocumentsTitle} description={noDocumentsDescription} />
      ) : (
        <SlideUp delay={0.1}>
          <AnimatePresence initial={false} mode="sync">
            <motion.div
              key={viewMode}
              initial={{ opacity: 0, y: 10, scale: 0.995 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.995 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="will-change-transform"
            >
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
                        <AnimatePresence>
                          {rootDocuments.map((doc) => (
                            <AnimatedItem key={doc.id}>
                              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable={isOwner(doc)} onDragStart={(event) => { if (!isOwner(doc)) return; dragMetaRef.current = { kind: "document", id: doc.id }; event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; setDraggedDocumentId(doc.id); setDraggedFolderId(null); setDropRootColumn(false); setDropColumnTargetId(null); logDnd("dragstart-doc-tree-root", { documentId: doc.id }); }} onDragEnd={resetDndState}>
                                <div className="min-w-0 flex-1 flex items-center gap-3">
                                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-lg">📄</div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-[var(--gbp-text)]">
                                      {doc.title}
                                      {doc.is_new ? <span className="ml-2 rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--gbp-success)]">NUEVO</span> : null}
                                    </p>
                                    <p className="truncate text-xs text-[var(--gbp-muted)]">
                                      {formatSize(doc.file_size_bytes)} · {(doc.mime_type ?? "archivo").toUpperCase()}
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
                            </AnimatedItem>
                          ))}
                        </AnimatePresence>
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
                                <button
                                  key={folder.id}
                                  type="button"
                                  draggable={isFolderOwner(folder)}
                                  onDragStart={(event) => {
                                    if (!isFolderOwner(folder)) return;
                                    suppressColumnClickRef.current = true;
                                    dragMetaRef.current = { kind: "folder", id: folder.id };
                                    event.dataTransfer.setData("application/x-folder-id", folder.id);
                                    event.dataTransfer.setData("text/plain", folder.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    logDnd("dragstart-folder", { folderId: folder.id, columnParentId: column.parentId ?? null });
                                    setDraggedFolderId(folder.id);
                                    setDraggedDocumentId(null);
                                    setDropRootColumn(false);
                                    setDropColumnTargetId(null);
                                  }}
                                  onDragEnd={() => {
                                    logDnd("dragend-folder", { folderId: folder.id });
                                    dragMetaRef.current = { kind: null, id: null };
                                    setDraggedFolderId(null);
                                    setDropFolderId(null);
                                    setDropRootColumn(false);
                                    setDropColumnTargetId(null);
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
                                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${dropFolderId === folder.id || column.selectedFolderId === folder.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      draggable={false}
                                      onClick={(event) => event.stopPropagation()}
                                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${isFolderOwner(folder) ? "cursor-grab text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text2)] active:cursor-grabbing" : "cursor-not-allowed text-[var(--gbp-border2)]"}`}
                                      title={isFolderOwner(folder) ? "Arrastrar carpeta" : "Solo puedes mover carpetas que creaste"}
                                    >
                                      <GripVertical className="h-3.5 w-3.5" />
                                    </span>
                                    <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--gbp-text2)]" />
                                    <span className="truncate text-sm font-medium text-[var(--gbp-text)]">{folder.name}</span>
                                  </span>
                                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--gbp-muted)]" />
                                </button>
                              ))}

                              {column.documents.map((doc) => (
                                <button
                                  key={doc.id}
                                  type="button"
                                  draggable={isOwner(doc)}
                                  onDragStart={(event) => {
                                    if (!isOwner(doc)) return;
                                    suppressColumnClickRef.current = true;
                                    dragMetaRef.current = { kind: "document", id: doc.id };
                                    event.dataTransfer.setData("application/x-document-id", doc.id);
                                    event.dataTransfer.setData("text/plain", doc.id);
                                    event.dataTransfer.effectAllowed = "move";
                                    logDnd("dragstart-document", { documentId: doc.id, columnParentId: column.parentId ?? null });
                                    setDraggedDocumentId(doc.id);
                                    setDraggedFolderId(null);
                                    setDropRootColumn(false);
                                    setDropColumnTargetId(null);
                                  }}
                                  onDragEnd={() => {
                                    logDnd("dragend-document", { documentId: doc.id });
                                    dragMetaRef.current = { kind: null, id: null };
                                    setDraggedDocumentId(null);
                                    setDraggedFolderId(null);
                                    setDropFolderId(null);
                                    setDropRootColumn(false);
                                    setDropColumnTargetId(null);
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
                                  className={`w-full rounded-lg border px-3 py-2 text-left ${selectedColumnDocId === doc.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                                >
                                  <span className="flex min-w-0 items-center gap-2">
                                    <span
                                      draggable={false}
                                      onClick={(event) => event.stopPropagation()}
                                      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded ${isOwner(doc) ? "cursor-grab text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text2)] active:cursor-grabbing" : "cursor-not-allowed text-[var(--gbp-border2)]"}`}
                                      title={isOwner(doc) ? "Arrastrar archivo" : "Solo puedes mover archivos que subiste"}
                                    >
                                      <GripVertical className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="truncate text-sm font-semibold text-[var(--gbp-text)]">{doc.title}</span>
                                  </span>
                                  <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">
                                    {formatSize(doc.file_size_bytes)} · {(doc.mime_type ?? "archivo").toUpperCase()}
                                  </p>
                                </button>
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
                              <p className="text-sm font-semibold text-[var(--gbp-text)]">{selectedColumnDocument.title}</p>
                              <p className="mt-1 text-xs text-[var(--gbp-text2)]">{formatSize(selectedColumnDocument.file_size_bytes)} · {(selectedColumnDocument.mime_type ?? "archivo").toUpperCase()}</p>
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
            </motion.div>
          </AnimatePresence>
        </SlideUp>
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
          hideScopeSelector
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
          hideScopeSelector
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
