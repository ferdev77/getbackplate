"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, Folder, ListTree, Columns3, UploadCloud } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FadeIn, SlideUp, AnimatedItem } from "@/shared/ui/animations";
import { EmptyState } from "@/shared/ui/empty-state";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { UploadDocumentModal } from "@/modules/documents/ui/upload-document-modal";
import { EmployeeDocumentEditModal } from "@/modules/documents/ui/employee-document-edit-modal";
import { EmployeeDocumentActions } from "@/modules/documents/ui/employee-document-actions";
import { useEmployeeDocumentMutations } from "@/modules/documents/hooks/use-employee-document-mutations";
import { useEmployeeDocumentsPreferences } from "@/modules/documents/hooks/use-employee-documents-preferences";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { DocumentPreviewPanel } from "@/modules/documents/ui/document-preview-panel";
import { AssignedCreatedToggle } from "@/shared/ui/assigned-created-toggle";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  access_scope?: unknown;
  created_at: string;
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
  const [documentsState, setDocumentsState] = useState<DocumentRow[]>(documents);
  const [ownershipView, setOwnershipView] = useState<"assigned" | "created">("assigned");
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [selectedColumnDocId, setSelectedColumnDocId] = useState<string | null>(null);
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

  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders]);
  const folderOptions = useMemo(() => folders.map((folder) => ({ id: folder.id, name: folder.name })), [folders]);

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
    for (const folder of folders) {
      const list = map.get(folder.parent_id) ?? [];
      list.push(folder);
      map.set(folder.parent_id, list);
    }
    return map;
  }, [folders]);

  const folderParentById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder.parent_id])),
    [folders],
  );

  const orderedFolderRows = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [folders],
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
    return ids;
  }, [filteredDocsByFolder, folderParentById]);

  const visibleFolderRows = useMemo(
    () => orderedFolderRows.filter((folder) => visibleFolderIds.has(folder.id)),
    [orderedFolderRows, visibleFolderIds],
  );

  const effectiveSelectedColumnFolderId = selectedColumnFolderId && visibleFolderRows.some((folder) => folder.id === selectedColumnFolderId)
    ? selectedColumnFolderId
    : null;

  function renderFolderTree(parentId: string | null, depth = 0) {
    const folderList = childrenByFolder.get(parentId) ?? [];
    return folderList.flatMap((folder) => {
      if (!visibleFolderIds.has(folder.id)) return [];
      const docList = filteredDocsByFolder.get(folder.id) ?? [];

      const isOpen = openFolders.has(folder.id);

      const row = (
        <AnimatedItem key={folder.id}>
          <div className="border-b border-[var(--gbp-border)]">
            <div className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]">
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
              >
                <ChevronRight className={`h-4 w-4 text-[var(--gbp-text2)] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-5 w-5 text-[var(--gbp-text2)]" />
                <span className="truncate text-sm font-semibold text-[var(--gbp-text)]">{folder.name}</span>
                <span className="text-xs text-[var(--gbp-muted)]">({docList.length})</span>
              </button>
            </div>
            
            <AnimatePresence>
              {isOpen && (
                <FadeIn delay={0.05}>
                  <div className="border-l-[3px] border-[var(--gbp-border)]">
                    {docList.map((doc) => (
                      <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]">
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

  const columnDocuments = useMemo(() => {
    return filteredDocsByFolder.get(effectiveSelectedColumnFolderId) ?? [];
  }, [effectiveSelectedColumnFolderId, filteredDocsByFolder]);

  const effectiveSelectedColumnDocId = selectedColumnDocId && columnDocuments.some((doc) => doc.id === selectedColumnDocId)
    ? selectedColumnDocId
    : (columnDocuments[0]?.id ?? null);

  const selectedColumnDocument = columnDocuments.find((doc) => doc.id === effectiveSelectedColumnDocId) ?? null;

  const isOwner = (doc: DocumentRow) => doc.owner_user_id === viewerUserId;

  const noDocumentsTitle = ownershipView === "created" ? "Aún no subiste documentos" : "Sin documentos asignados";
  const noDocumentsDescription = ownershipView === "created"
    ? "Todavía no subiste documentos en este módulo."
    : "No hay documentos visibles para tu perfil en este momento.";

  const noResultsLabel = `No se encontraron resultados para \"${query}\" en ${ownershipView === "created" ? "Subidos" : "Asignados"}.`;

  return (
    <>
      <OperationHeaderCard
        eyebrow="Operación diaria"
        title="Mis Documentos"
        description="Explora y gestiona los documentos operativos que tienes asignados o subidos según tu perfil."
        action={(
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex h-[33px] items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode("tree")}
                data-testid="portal-documents-view-tree"
                className={`rounded-md p-1.5 transition-colors ${viewMode === "tree" ? "bg-[var(--gbp-bg)] text-[var(--gbp-text)] shadow-sm" : "text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"}`}
                title="Vista de Árbol"
              >
                <ListTree className="h-4.5 w-4.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("columns")}
                data-testid="portal-documents-view-columns"
                className={`rounded-md p-1.5 transition-colors ${viewMode === "columns" ? "bg-[var(--gbp-bg)] text-[var(--gbp-text)] shadow-sm" : "text-[var(--gbp-text2)] hover:text-[var(--gbp-text)]"}`}
                title="Vista de Columnas"
              >
                <Columns3 className="h-4.5 w-4.5" />
              </button>
            </div>
            {canCreate ? (
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                disabled={busy}
                className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-accent)] px-3 text-xs font-bold text-white disabled:opacity-70"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Subir Archivo
              </button>
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

      {ownershipDocumentsCount === 0 ? (
        <EmptyState title={noDocumentsTitle} description={noDocumentsDescription} />
      ) : (
        <SlideUp delay={0.1}>
          <AnimatePresence mode="wait">
            <motion.div
              key={viewMode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18 }}
            >
              {viewMode === "tree" ? (
                <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                  <div className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs font-bold uppercase tracking-[0.07em] text-[var(--gbp-muted)]">
                    Explorador de Archivos
                  </div>
                  <div>
                    {totalVisibleDocuments === 0 && query.trim() ? (
                      <div className="p-8 text-center text-sm text-[var(--gbp-text2)]">{noResultsLabel}</div>
                    ) : (
                      <>
                        {renderFolderTree(null)}
                        <AnimatePresence>
                          {rootDocuments.map((doc) => (
                            <AnimatedItem key={doc.id}>
                              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]">
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
                <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                  <div className="grid min-h-[520px] grid-cols-1 divide-y divide-[var(--gbp-border)] lg:grid-cols-[260px_minmax(260px,1fr)_minmax(260px,1fr)] lg:divide-x lg:divide-y-0">
                    <div className="bg-[var(--gbp-bg)] p-3">
                      <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Carpetas</p>
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => setSelectedColumnFolderId(null)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${effectiveSelectedColumnFolderId === null ? "bg-[var(--gbp-surface)] font-semibold text-[var(--gbp-text)]" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface)]"}`}
                        >
                          <span>Raiz</span>
                          <span className="text-[11px] text-[var(--gbp-muted)]">{filteredDocsByFolder.get(null)?.length ?? 0}</span>
                        </button>
                        {visibleFolderRows.map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => setSelectedColumnFolderId(folder.id)}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${effectiveSelectedColumnFolderId === folder.id ? "bg-[var(--gbp-surface)] font-semibold text-[var(--gbp-text)]" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface)]"}`}
                          >
                            <span className="truncate">{folder.name}</span>
                            <span className="text-[11px] text-[var(--gbp-muted)]">{filteredDocsByFolder.get(folder.id)?.length ?? 0}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="self-start p-3 lg:sticky lg:top-3">
                      <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Documentos</p>
                      <div className="space-y-1">
                        {columnDocuments.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-[var(--gbp-border2)] px-3 py-8 text-center text-sm text-[var(--gbp-muted)]">
                            {query.trim() ? noResultsLabel : "No hay documentos para esta carpeta en la vista actual."}
                          </p>
                        ) : columnDocuments.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => setSelectedColumnDocId(doc.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left ${effectiveSelectedColumnDocId === doc.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] hover:bg-[var(--gbp-bg)]"}`}
                          >
                            <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{doc.title}</p>
                            <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">{formatSize(doc.file_size_bytes)} · {(doc.mime_type ?? "archivo").toUpperCase()}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-3">
                      <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Detalle</p>
                      {!selectedColumnDocument ? (
                        <p className="rounded-lg border border-dashed border-[var(--gbp-border2)] px-3 py-8 text-center text-sm text-[var(--gbp-muted)]">Selecciona un documento para visualizarlo.</p>
                      ) : (
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
                      )}
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
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
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
