"use client";

import { useMemo, useState } from "react";
import { Download, Eye, Search, ChevronRight, Folder } from "lucide-react";
import { AnimatePresence } from "framer-motion";
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
  folders: FolderRow[];
  documents: DocumentRow[];
};

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmployeeDocumentsTree({ folders, documents }: Props) {
  const [query, setQuery] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());

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
                          <a href={`/api/documents/${doc.id}/download`} target="_blank" className="group relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
                            <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver</span>
                            <TooltipLabel label="Vista preliminar" />
                          </a>
                          <a href={`/api/documents/${doc.id}/download`} download className="group relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">
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
      </section>

      {!documents.length && !folders.length ? (
        <EmptyState title="Sin documentos" description="Aun no tienes documentos visibles o asignados." />
      ) : (
        <SlideUp delay={0.1}>
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
                        <a href={`/api/documents/${doc.id}/download`} target="_blank" className="group relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]">
                          <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver</span>
                          <TooltipLabel label="Vista preliminar" />
                        </a>
                        <a href={`/api/documents/${doc.id}/download`} className="group relative inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white transition-colors hover:bg-[var(--gbp-accent)]">
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
        </SlideUp>
      )}
    </>
  );
}
