"use client";

import { useMemo, useState } from "react";
import { Download, Eye, Search, ChevronRight, Folder } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { FadeIn, SlideUp, AnimatedList, AnimatedItem } from "@/shared/ui/animations";
import { EmptyState } from "@/shared/ui/empty-state";

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

function formatDate(dateText: string) {
  return new Date(dateText).toLocaleDateString("es-AR");
}

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
          <div className="border-b border-[#f0f0f0]">
            <div className="flex items-center justify-between px-4 py-3 hover:bg-[#fafafa] transition-colors">
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
                <ChevronRight className={`h-4 w-4 text-[#888] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-5 w-5 text-[#888]" />
                <span className="truncate text-sm font-semibold text-[#111]">{folder.name}</span>
                <span className="text-xs text-[#bbb]">({docList.length})</span>
              </button>
            </div>
            
            <AnimatePresence>
              {isOpen && (
                <FadeIn delay={0.05}>
                  <div className="border-l-[3px] border-[#e8e8e8]">
                    {docList.map((doc) => (
                      <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 border-t border-[#f3f3f3] px-4 py-3 hover:bg-[#fcfcfc] transition-colors">
                        <div className="min-w-0 flex-1 flex items-center gap-3" style={{ paddingLeft: `${(depth + 1) * 20}px` }}>
                           <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#f0d5d0] bg-[#fff5f3] text-lg">📄</div>
                           <div className="min-w-0">
                             <p className="truncate text-sm font-bold text-[#222]">
                               {doc.title}
                               {doc.is_new ? <span className="ml-2 rounded-full border border-[#c3efd4] bg-[#edfbf3] px-2 py-0.5 text-[10px] font-bold text-[#27ae60]">NUEVO</span> : null}
                             </p>
                             <p className="truncate text-xs text-[#bbb]">
                               {formatSize(doc.file_size_bytes)} · {(doc.mime_type ?? "archivo").toUpperCase()}
                             </p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a href={`/api/documents/${doc.id}/download`} target="_blank" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e8] bg-white px-3 text-xs font-semibold text-[#666] hover:bg-[#f6f6f6] transition-colors" title="Vista preliminar">
                            <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver</span>
                          </a>
                          <a href={`/api/documents/${doc.id}/download`} download className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#111] px-3 text-xs font-bold text-white hover:bg-[#c0392b] transition-colors" title="Descargar">
                            <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Descargar</span>
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
      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e7e0dc] bg-white p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#aaa]" />
          <input 
            value={query} 
            onChange={(event) => setQuery(event.target.value)} 
            className="w-full h-10 rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#fdfdfd] pl-10 pr-3 text-sm focus:border-[#c0392b] focus:outline-none transition-colors" 
            placeholder="Buscar documentos..." 
          />
        </div>
      </section>

      {!documents.length && !folders.length ? (
        <EmptyState title="Sin documentos" description="Aun no tienes documentos visibles o asignados." />
      ) : (
        <SlideUp delay={0.1}>
          <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white">
            <div className="bg-[#fafafa] px-4 py-3 text-xs font-bold tracking-[0.07em] text-[#aaa] uppercase border-b border-[#e8e8e8]">
              Explorador de Archivos
            </div>
            <div>
              {renderFolderTree(null)}
              <AnimatePresence>
                {rootDocuments.map((doc) => (
                  <AnimatedItem key={doc.id}>
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#f0f0f0] px-4 py-3 hover:bg-[#fcfcfc] transition-colors">
                      <div className="min-w-0 flex-1 flex items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-[#f0d5d0] bg-[#fff5f3] text-lg">📄</div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#222]">
                            {doc.title}
                            {doc.is_new ? <span className="ml-2 rounded-full border border-[#c3efd4] bg-[#edfbf3] px-2 py-0.5 text-[10px] font-bold text-[#27ae60]">NUEVO</span> : null}
                          </p>
                          <p className="truncate text-xs text-[#bbb]">
                            {formatSize(doc.file_size_bytes)} · {(doc.mime_type ?? "archivo").toUpperCase()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <a href={`/api/documents/${doc.id}/download`} target="_blank" className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e8] bg-white px-3 text-xs font-semibold text-[#666] hover:bg-[#eee] transition-colors" title="Vista preliminar">
                          <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ver</span>
                        </a>
                        <a href={`/api/documents/${doc.id}/download`} className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#111] px-3 text-xs font-bold text-white hover:bg-[#c0392b] transition-colors" title="Descargar">
                          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Descargar</span>
                        </a>
                      </div>
                    </div>
                  </AnimatedItem>
                ))}
              </AnimatePresence>
              
              {!rootDocuments.length && !folders.length && query && (
                <div className="p-8 text-center text-[#888] text-sm">
                  No se encontraron resultados para "{query}"
                </div>
              )}
            </div>
          </section>
        </SlideUp>
      )}
    </>
  );
}
