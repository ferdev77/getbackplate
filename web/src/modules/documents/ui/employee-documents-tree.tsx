"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Eye, Search, ChevronRight, Folder, ListTree, Columns3 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { FadeIn, SlideUp, AnimatedItem } from "@/shared/ui/animations";
import { EmptyState } from "@/shared/ui/empty-state";
import { TooltipLabel } from "@/shared/ui/tooltip";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
};

type DocumentRow = {
  id: string;
  title: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  folder_id: string | null;
  created_at: string;
  is_new?: boolean;
};

type Props = {
  organizationId: string;
  viewerUserId: string;
  folders: FolderRow[];
  documents: DocumentRow[];
  initialViewMode?: "tree" | "columns";
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

export function EmployeeDocumentsTree({ organizationId, viewerUserId, folders, documents, initialViewMode = "tree" }: Props) {
  const [query, setQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"tree" | "columns">(initialViewMode);
  const [selectedColumnFolderId, setSelectedColumnFolderId] = useState<string | null>(null);
  const [selectedColumnDocId, setSelectedColumnDocId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ docId: string | null; status: "idle" | "loading" | "ready" | "error" }>({
    docId: null,
    status: "idle",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.view:${organizationId}:${viewerUserId}`;
    window.localStorage.setItem(key, viewMode);
  }, [organizationId, viewerUserId, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.view:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);
    if (stored !== "tree" && stored !== "columns") return;

    const frame = window.requestAnimationFrame(() => {
      setViewMode((prev) => (prev === stored ? prev : stored));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.columns.folder:${organizationId}:${viewerUserId}`;
    if (selectedColumnFolderId) {
      window.localStorage.setItem(key, selectedColumnFolderId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [organizationId, selectedColumnFolderId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.portal.documents.columns.folder:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);
    if (!stored) return;

    const frame = window.requestAnimationFrame(() => {
      setSelectedColumnFolderId((prev) => (prev === stored ? prev : stored));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  const docsByFolder = useMemo(() => {
    const map = new Map<string | null, DocumentRow[]>();
    for (const doc of documents) {
      const list = map.get(doc.folder_id) ?? [];
      list.push(doc);
      map.set(doc.folder_id, list);
    }
    return map;
  }, [documents]);

  const childrenByFolder = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const folder of folders) {
      const list = map.get(folder.parent_id) ?? [];
      list.push(folder);
      map.set(folder.parent_id, list);
    }
    return map;
  }, [folders]);

  const orderedFolderRows = useMemo(
    () => [...folders].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [folders],
  );

  const effectiveSelectedColumnFolderId = selectedColumnFolderId && folders.some((folder) => folder.id === selectedColumnFolderId)
    ? selectedColumnFolderId
    : null;

  function includeDocument(doc: DocumentRow) {
    const q = query.trim().toLowerCase();
    if (q && !doc.title.toLowerCase().includes(q)) return false;
    return true;
  }

  function sortDocuments(rows: DocumentRow[]) {
    return [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }

  function renderFolderTree(parentId: string | null, depth = 0) {
    const folderList = childrenByFolder.get(parentId) ?? [];
    return folderList.flatMap((folder) => {
      const docList = sortDocuments((docsByFolder.get(folder.id) ?? []).filter(includeDocument));
      const hasChildren = (childrenByFolder.get(folder.id) ?? []).length > 0;
      
      // Si la carpeta está vacía y no tiene subcarpetas, y hay búsqueda, podríamos ocultarla
      // Pero para simplificar, la mostramos.
      if (query.trim() && docList.length === 0 && !hasChildren) return [];

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
                        <div className="flex items-center gap-2">
                          <a href={`/api/documents/${doc.id}/download`} target="_blank" className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
                            <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver</span>
                            <TooltipLabel label="Vista preliminar" />
                          </a>
                          <a href={`/api/documents/${doc.id}/download`} download className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">
                            <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Descargar</span>
                            <TooltipLabel label="Descargar" />
                          </a>
                        </div>
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

  const rootDocuments = sortDocuments((docsByFolder.get(null) ?? []).filter(includeDocument));

  const columnDocuments = useMemo(() => {
    const rows = docsByFolder.get(effectiveSelectedColumnFolderId) ?? [];
    const q = query.trim().toLowerCase();
    return sortDocuments(rows.filter((doc) => (q ? doc.title.toLowerCase().includes(q) : true)));
  }, [docsByFolder, effectiveSelectedColumnFolderId, query]);

  const effectiveSelectedColumnDocId = selectedColumnDocId && columnDocuments.some((doc) => doc.id === selectedColumnDocId)
    ? selectedColumnDocId
    : (columnDocuments[0]?.id ?? null);

  const selectedColumnDocument = columnDocuments.find((doc) => doc.id === effectiveSelectedColumnDocId) ?? null;

  return (
    <>
      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--gbp-muted)]" />
          <input 
            value={query} 
            onChange={(event) => setQuery(event.target.value)} 
            className="h-10 w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] pl-10 pr-3 text-sm text-[var(--gbp-text)] transition-colors focus:border-[var(--gbp-accent)] focus:outline-none" 
            placeholder="Buscar documentos..." 
          />
        </div>
        <div className="inline-flex h-10 items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] p-0.5">
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
      </section>

      {!documents.length && !folders.length ? (
        <EmptyState title="Sin documentos" description="Aún no tienes documentos visibles o asignados." />
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
                            <div className="flex gap-2">
                              <a href={`/api/documents/${doc.id}/download`} target="_blank" className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
                                <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver</span>
                                <TooltipLabel label="Vista preliminar" />
                              </a>
                              <a href={`/api/documents/${doc.id}/download`} className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">
                                <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Descargar</span>
                                <TooltipLabel label="Descargar" />
                              </a>
                            </div>
                          </div>
                        </AnimatedItem>
                      ))}
                    </AnimatePresence>

                    {!rootDocuments.length && !folders.length && query && (
                      <div className="p-8 text-center text-sm text-[var(--gbp-text2)]">
                        No se encontraron resultados para &quot;{query}&quot;
                      </div>
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
                          <span className="text-[11px] text-[var(--gbp-muted)]">{docsByFolder.get(null)?.length ?? 0}</span>
                        </button>
                        {orderedFolderRows.map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => setSelectedColumnFolderId(folder.id)}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${effectiveSelectedColumnFolderId === folder.id ? "bg-[var(--gbp-surface)] font-semibold text-[var(--gbp-text)]" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface)]"}`}
                          >
                            <span className="truncate">{folder.name}</span>
                            <span className="text-[11px] text-[var(--gbp-muted)]">{docsByFolder.get(folder.id)?.length ?? 0}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="self-start p-3 lg:sticky lg:top-3">
                      <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Documentos</p>
                      <div className="space-y-1">
                        {columnDocuments.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-[var(--gbp-border2)] px-3 py-8 text-center text-sm text-[var(--gbp-muted)]">No hay documentos para los filtros actuales.</p>
                        ) : columnDocuments.map((doc) => (
                          <button
                            key={doc.id}
                            type="button"
                            onClick={() => setSelectedColumnDocId(doc.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left ${selectedColumnDocId === doc.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] hover:bg-[var(--gbp-bg)]"}`}
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
                          <div className="flex items-center gap-2">
                            <a href={`/api/documents/${selectedColumnDocument.id}/download`} target="_blank" className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
                              <Eye className="h-3.5 w-3.5" /> <span>Ver</span>
                              <TooltipLabel label="Vista preliminar" />
                            </a>
                            <a href={`/api/documents/${selectedColumnDocument.id}/download`} className="group/tooltip relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">
                              <Download className="h-3.5 w-3.5" /> <span>Descargar</span>
                              <TooltipLabel label="Descargar" />
                            </a>
                          </div>
                          <div className="relative overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
                            <AnimatePresence mode="wait">
                              <motion.div
                                key={selectedColumnDocument.id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.12 }}
                              >
                                {selectedColumnDocument.mime_type?.startsWith("image/") ? (
                                  <img
                                    src={`/api/documents/preview?documentId=${encodeURIComponent(selectedColumnDocument.id)}`}
                                    alt={`Vista previa ${selectedColumnDocument.title}`}
                                    className="h-[clamp(260px,42vh,420px)] w-full object-contain bg-white"
                                    onLoad={() => setPreviewState({ docId: selectedColumnDocument.id, status: "ready" })}
                                    onError={() => setPreviewState({ docId: selectedColumnDocument.id, status: "error" })}
                                  />
                                ) : isPreviewableMime(selectedColumnDocument.mime_type) ? (
                                  <iframe
                                    src={`/api/documents/preview?documentId=${encodeURIComponent(selectedColumnDocument.id)}`}
                                    title={`Vista previa ${selectedColumnDocument.title}`}
                                    className="h-[clamp(260px,42vh,420px)] w-full bg-white"
                                    onLoad={() => setPreviewState({ docId: selectedColumnDocument.id, status: "ready" })}
                                  />
                                ) : (
                                  <div className="grid h-[240px] place-items-center p-4 text-center text-sm text-[var(--gbp-text2)]">
                                    Este formato no tiene previsualizacion embebida. Usa Ver o Descargar.
                                  </div>
                                )}
                              </motion.div>
                            </AnimatePresence>
                            {previewState.docId !== selectedColumnDocument.id || previewState.status === "loading" ? (
                              <div className="pointer-events-none absolute inset-0 grid place-items-center bg-[color:color-mix(in_oklab,var(--gbp-surface)_82%,transparent)]">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--gbp-border2)] border-t-[var(--gbp-accent)]" />
                              </div>
                            ) : null}
                            {previewState.docId === selectedColumnDocument.id && previewState.status === "error" ? (
                              <div className="absolute inset-0 grid place-items-center bg-[color:color-mix(in_oklab,var(--gbp-surface)_90%,transparent)] p-3 text-center text-xs text-[var(--gbp-text2)]">
                                No se pudo cargar la vista previa. Usa Ver o Descargar.
                              </div>
                            ) : null}
                          </div>
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
    </>
  );
}
