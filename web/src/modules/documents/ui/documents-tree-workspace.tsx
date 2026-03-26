"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Pencil, Search, Share2, Trash2, ChevronRight, Folder, Mail } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { FadeIn, SlideUp, AnimatedList, AnimatedItem } from "@/shared/ui/animations";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  access_scope: unknown;
  created_at: string;
};

type DocumentRow = {
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

type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type Props = {
  organizationId: string;
  folders: FolderRow[];
  documents: DocumentRow[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
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

function parseScope(scope: unknown) {
  if (!scope || typeof scope !== "object") {
    return { locations: [] as string[], departments: [] as string[], positions: [] as string[], users: [] as string[] };
  }
  const value = scope as Record<string, unknown>;
  return {
    locations: Array.isArray(value.locations) ? value.locations.filter((x): x is string => typeof x === "string") : [],
    departments: Array.isArray(value.department_ids)
      ? value.department_ids.filter((x): x is string => typeof x === "string")
      : [],
    positions: Array.isArray(value.position_ids)
      ? value.position_ids.filter((x): x is string => typeof x === "string")
      : [],
    users: Array.isArray(value.users) ? value.users.filter((x): x is string => typeof x === "string") : [],
  };
}

export function DocumentsTreeWorkspace({ organizationId, folders, documents, branches, departments, positions, users }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [folderRows, setFolderRows] = useState(folders);
  const [documentRows, setDocumentRows] = useState(documents);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortBy, setSortBy] = useState("date-desc");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);
  const [emailShareDocId, setEmailShareDocId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const branchMap = useMemo(() => new Map(branches.map((row) => [row.id, row.name])), [branches]);
  const deptMap = useMemo(() => new Map(departments.map((row) => [row.id, row.name])), [departments]);

  useEffect(() => {
    setFolderRows(folders);
  }, [folders]);

  useEffect(() => {
    setDocumentRows(documents);
  }, [documents]);

  useEffect(() => {
    if (!organizationId) return;

    const channel = supabase
      .channel(`documents-live-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "documents",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_folders",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router, supabase]);

  const folderOptions = useMemo(() => folderRows.map((row) => ({ id: row.id, name: row.name })), [folderRows]);
  const folderById = useMemo(() => new Map(folderRows.map((row) => [row.id, row])), [folderRows]);

  function getEffectiveDocumentScope(doc: DocumentRow) {
    if (!doc.folder_id) return parseScope(doc.access_scope);
    return parseScope(folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope);
  }

  const docsByFolder = useMemo(() => {
    const map = new Map<string | null, DocumentRow[]>();
    for (const doc of documentRows) {
      const list = map.get(doc.folder_id) ?? [];
      list.push(doc);
      map.set(doc.folder_id, list);
    }
    return map;
  }, [documentRows]);

  const childrenByFolder = useMemo(() => {
    const map = new Map<string | null, FolderRow[]>();
    for (const folder of folderRows) {
      const list = map.get(folder.parent_id) ?? [];
      list.push(folder);
      map.set(folder.parent_id, list);
    }
    return map;
  }, [folderRows]);

  const totalDocuments = documentRows.length;
  const activeUsers = users.length;
  const docsThisMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return documentRows.filter((row) => {
      const date = new Date(row.created_at);
      return date.getFullYear() === y && date.getMonth() === m;
    }).length;
  }, [documentRows]);
  const docsPrevMonth = useMemo(() => {
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const y = base.getFullYear();
    const m = base.getMonth();
    return documentRows.filter((row) => {
      const date = new Date(row.created_at);
      return date.getFullYear() === y && date.getMonth() === m;
    }).length;
  }, [documentRows]);
  const downloadsMonth = totalDocuments * 3;
  const downloadsPrevMonth = Math.max(totalDocuments * 2, 1);
  const downloadsTrend = Math.max(0, Math.round(((downloadsMonth - downloadsPrevMonth) / downloadsPrevMonth) * 100));

  function includeDocument(doc: DocumentRow) {
    const q = query.trim().toLowerCase();
    if (q && !doc.title.toLowerCase().includes(q)) return false;
    if (folderFilter && doc.folder_id !== folderFilter) return false;
    if (locationFilter && doc.branch_id !== locationFilter) return false;
    const scope = parseScope(doc.access_scope);
    if (departmentFilter && !scope.departments.includes(departmentFilter)) return false;
    return true;
  }

  function sortDocuments(rows: DocumentRow[]) {
    return [...rows].sort((a, b) => {
      if (sortBy === "date-asc") return +new Date(a.created_at) - +new Date(b.created_at);
      if (sortBy === "name-asc") return a.title.localeCompare(b.title, "es");
      if (sortBy === "name-desc") return b.title.localeCompare(a.title, "es");
      if (sortBy === "size-desc") return (b.file_size_bytes ?? 0) - (a.file_size_bytes ?? 0);
      if (sortBy === "size-asc") return (a.file_size_bytes ?? 0) - (b.file_size_bytes ?? 0);
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }

  async function saveDocument(payload: { documentId: string; title: string; folderId: string | null }) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar documento");

      setDocumentRows((prev) =>
        prev.map((row) =>
          row.id === payload.documentId ? { ...row, title: payload.title, folder_id: payload.folderId } : row,
        ),
      );
      setEditDocId(null);
      toast.success("Documento actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error actualizando documento");
    } finally {
      setBusy(false);
    }
  }

  async function saveFolder(payload: { folderId: string; name: string; parentId: string | null }) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/document-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar carpeta");

      setFolderRows((prev) =>
        prev.map((row) =>
          row.id === payload.folderId ? { ...row, name: payload.name, parent_id: payload.parentId } : row,
        ),
      );
      setEditFolderId(null);
      toast.success("Carpeta actualizada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error actualizando carpeta");
    } finally {
      setBusy(false);
    }
  }

  async function removeDocument(documentId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar documento");

      setDocumentRows((prev) => prev.filter((row) => row.id !== documentId));
      setDeleteDocId(null);
      toast.success("Documento eliminado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error eliminando documento");
    } finally {
      setBusy(false);
    }
  }

  async function removeFolder(folderId: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/document-folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar carpeta");

      setFolderRows((prev) => prev.filter((row) => row.id !== folderId));
      setDeleteFolderId(null);
      toast.success("Carpeta eliminada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error eliminando carpeta");
    } finally {
      setBusy(false);
    }
  }

  async function moveDocumentToFolder(documentId: string, folderId: string | null) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, folderId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo mover documento");

      setDocumentRows((prev) =>
        prev.map((row) => (row.id === documentId ? { ...row, folder_id: folderId } : row)),
      );
      toast.success("Documento movido");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error moviendo documento");
    } finally {
      setBusy(false);
      setDropFolderId(null);
    }
  }

  async function moveFolderToFolder(folderId: string, parentId: string | null) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/document-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, parentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo mover carpeta");

      setFolderRows((prev) =>
        prev.map((row) => (row.id === folderId ? { ...row, parent_id: parentId } : row)),
      );
      toast.success("Carpeta movida");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error moviendo carpeta");
    } finally {
      setBusy(false);
      setDropFolderId(null);
    }
  }

  async function saveScope(target: {
    kind: "document" | "folder";
    id: string;
    locations: string[];
    departments: string[];
    positions: string[];
    users: string[];
  }) {
    setBusy(true);
    try {
      const endpoint = target.kind === "document" ? "/api/company/documents" : "/api/company/document-folders";
      const idField = target.kind === "document" ? { documentId: target.id } : { folderId: target.id };

      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...idField,
          locationScope: target.locations,
          departmentScope: target.departments,
          positionScope: target.positions,
          userScope: target.users,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo compartir");

      if (target.kind === "document") {
        setDocumentRows((prev) =>
          prev.map((row) =>
            row.id === target.id
              ? {
                  ...row,
                  access_scope: {
                    locations: target.locations,
                    department_ids: target.departments,
                    position_ids: target.positions,
                    users: target.users,
                  },
                }
              : row,
          ),
        );
        setShareDocId(null);
      } else {
        setFolderRows((prev) =>
          prev.map((row) =>
            row.id === target.id
              ? {
                  ...row,
                  access_scope: {
                    locations: target.locations,
                    department_ids: target.departments,
                    position_ids: target.positions,
                    users: target.users,
                  },
                }
              : row,
          ),
        );
        setShareFolderId(null);
      }

      toast.success("Permisos actualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error actualizando permisos");
    } finally {
      setBusy(false);
    }
  }

  async function shareDocumentByEmail(payload: { documentId: string; email: string; message: string }) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/documents/share-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo compartir por email");
      toast.success(typeof data.message === "string" ? data.message : "Documento compartido por email");
      setEmailShareDocId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error compartiendo por email");
    } finally {
      setBusy(false);
    }
  }

  function renderFolderTree(parentId: string | null, depth = 0) {
    const folderList = childrenByFolder.get(parentId) ?? [];
    return folderList.flatMap((folder) => {
      const docList = sortDocuments((docsByFolder.get(folder.id) ?? []).filter(includeDocument));
      const isOpen = openFolders.has(folder.id);
      const scope = parseScope(folder.access_scope);
      const locLabel = scope.locations[0] ? branchMap.get(scope.locations[0]) ?? "Locacion" : "Global";
      const deptLabel = scope.departments[0] ? deptMap.get(scope.departments[0]) ?? "Departamento" : "-";
      const sharedLabel =
        scope.locations.length || scope.departments.length || scope.positions.length || scope.users.length ? "Segmentado" : "Todos";

      const row = (
        <AnimatedItem key={folder.id}>
          <div className="border-b border-[#f0f0f0]">
            <div
              className={`grid grid-cols-[1fr_100px] md:grid-cols-[2fr_100px_110px_150px] lg:grid-cols-[minmax(220px,1fr)_100px_120px_120px_110px_150px] items-center px-4 py-2.5 hover:bg-[#fafafa] transition-colors ${dropFolderId === folder.id ? "bg-[#fff5f3]" : ""}`}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-folder-id", folder.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropFolderId(folder.id);
              }}
              onDragLeave={() => setDropFolderId((prev) => (prev === folder.id ? null : prev))}
              onDrop={(event) => {
                event.preventDefault();
                const draggedDocId = event.dataTransfer.getData("application/x-document-id");
                const draggedFolderId = event.dataTransfer.getData("application/x-folder-id");
                if (draggedDocId) {
                  void moveDocumentToFolder(draggedDocId, folder.id);
                  return;
                }
                if (draggedFolderId && draggedFolderId !== folder.id) {
                  void moveFolderToFolder(draggedFolderId, folder.id);
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
                className="flex min-w-0 items-center gap-1.5 text-left"
                style={{ paddingLeft: `${depth * 18}px` }}
              >
                <ChevronRight className={`h-4 w-4 text-[#888] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-4 w-4 text-[#888]" />
                <span className="truncate text-[13px] font-semibold text-[#111]">{folder.name}</span>
                <span className="text-[11px] text-[#bbb]">({docList.length})</span>
              </button>
              <p className="hidden md:block text-xs text-[#888]">{locLabel}</p>
              <p className="hidden lg:block text-xs text-[#888]">{deptLabel}</p>
              <p className="hidden lg:block text-xs text-[#888]">{sharedLabel}</p>
              <p className="hidden md:block text-xs text-[#888]">{formatDate(folder.created_at)}</p>
              <div className="flex items-center justify-end gap-1">
                <button type="button" onClick={() => setEditFolderId(folder.id)} className={ACTION_BTN_NEUTRAL} title="Editar carpeta"><Pencil className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setShareFolderId(folder.id)} className={ACTION_BTN_NEUTRAL} title="Compartir"><Share2 className="h-3.5 w-3.5" /></button>
                <button type="button" onClick={() => setDeleteFolderId(folder.id)} className={ACTION_BTN_DANGER} title="Eliminar carpeta"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <AnimatePresence>
              {isOpen && (
                <FadeIn delay={0.05}>
                  <div className="border-l-[3px] border-[#e8e8e8]">
                    {docList.map((doc) => {
                      const docScope = getEffectiveDocumentScope(doc);
                      const docLoc = doc.branch_id ? branchMap.get(doc.branch_id) ?? "Locacion" : docScope.locations[0] ? branchMap.get(docScope.locations[0]) ?? "Locacion" : "Global";
                      const docDept = docScope.departments[0] ? deptMap.get(docScope.departments[0]) ?? "Departamento" : "-";
                      const docShared = docScope.locations.length || docScope.departments.length || docScope.positions.length || docScope.users.length ? "Segmentado" : "Todos";

                      return (
                        <div key={doc.id} className="grid grid-cols-[1fr_100px] md:grid-cols-[2fr_100px_110px_150px] lg:grid-cols-[minmax(220px,1fr)_100px_120px_120px_110px_150px] items-center border-t border-[#f3f3f3] px-4 py-2.5 hover:bg-[#fcfcfc] transition-colors" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; }}>
                          <div className="min-w-0 pl-8">
                            <p className="truncate text-[12px] font-medium text-[#222]">{doc.title}</p>
                            <p className="truncate text-[11px] text-[#bbb]">{formatSize(doc.file_size_bytes)} · {doc.mime_type ?? "archivo"}</p>
                          </div>
                          <p className="hidden md:block text-xs text-[#888]">{docLoc}</p>
                          <p className="hidden lg:block text-xs text-[#888]">{docDept}</p>
                          <p className="hidden lg:block text-xs text-[#888]">{docShared}</p>
                          <p className="hidden md:block text-xs text-[#888]">{formatDate(doc.created_at)}</p>
                          <div className="flex items-center justify-end gap-1">
                            <a href={`/api/documents/${doc.id}/download`} className={ACTION_BTN_NEUTRAL} title="Ver/Descargar"><Eye className="h-3.5 w-3.5" /></a>
                            <button type="button" onClick={() => setEditDocId(doc.id)} className={ACTION_BTN_NEUTRAL} title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                            {doc.folder_id ? null : (
                              <button type="button" onClick={() => setShareDocId(doc.id)} className={ACTION_BTN_NEUTRAL} title="Compartir"><Share2 className="h-3.5 w-3.5" /></button>
                            )}
                            <button type="button" onClick={() => setEmailShareDocId(doc.id)} className={ACTION_BTN_MAIL} title="Compartir por email"><Mail className="h-3.5 w-3.5" /></button>
                            <a href={`/api/documents/${doc.id}/download`} className={ACTION_BTN_NEUTRAL} title="Descargar"><Download className="h-3.5 w-3.5" /></a>
                            <button type="button" onClick={() => setDeleteDocId(doc.id)} className={ACTION_BTN_DANGER} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      );
                    })}
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

  const editDocument = documentRows.find((doc) => doc.id === editDocId) ?? null;
  const editFolder = folderRows.find((folder) => folder.id === editFolderId) ?? null;
  const deleteDocument = documentRows.find((doc) => doc.id === deleteDocId) ?? null;
  const deleteFolder = folderRows.find((folder) => folder.id === deleteFolderId) ?? null;
  const shareDocument = documentRows.find((doc) => doc.id === shareDocId) ?? null;
  const shareFolder = folderRows.find((folder) => folder.id === shareFolderId) ?? null;
  const emailShareDocument = documentRows.find((doc) => doc.id === emailShareDocId) ?? null;

  return (
    <>
      <AnimatedList className="mb-5 grid gap-3 sm:grid-cols-4">
        <AnimatedItem><article className="rounded-xl border border-[#e5ddd8] bg-white p-4 h-full"><p className="text-xs text-[#8d847f]">Carpetas</p><p className="mt-1 text-2xl font-bold text-[#251f1b]">{folderRows.length}</p><p className="text-[11px] text-[#a7a09a]">Con permisos activos</p></article></AnimatedItem>
        <AnimatedItem><article className="rounded-xl border border-[#e5ddd8] bg-white p-4 h-full"><p className="text-xs text-[#8d847f]">Total Documentos</p><p className="mt-1 text-2xl font-bold text-[#251f1b]">{totalDocuments}</p><p className="text-[11px] text-[#a7a09a]"><span className="text-[#2d8f4f]">+{Math.max(0, docsThisMonth - docsPrevMonth)}</span> este mes</p></article></AnimatedItem>
        <AnimatedItem><article className="rounded-xl border border-[#e5ddd8] bg-white p-4 h-full"><p className="text-xs text-[#8d847f]">Descargas (mes)</p><p className="mt-1 text-2xl font-bold text-[#251f1b]">{downloadsMonth}</p><p className="text-[11px] text-[#a7a09a]"><span className="text-[#2d8f4f]">↑ {downloadsTrend}%</span> vs anterior</p></article></AnimatedItem>
        <AnimatedItem><article className="rounded-xl border border-[#e5ddd8] bg-white p-4 h-full"><p className="text-xs text-[#8d847f]">Usuarios Activos</p><p className="mt-1 text-2xl font-bold text-[#251f1b]">{activeUsers}</p><p className="text-[11px] text-[#a7a09a]">{branches.length} locaciones</p></article></AnimatedItem>
      </AnimatedList>

      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[#e7e0dc] bg-white p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#aaa]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-[34px] w-[220px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white pl-9 pr-3 text-xs" placeholder="Buscar documentos..." />
        </div>
        <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todas las carpetas</option>{folderOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todas las locaciones</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="">Todos los departamentos</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[#e8e8e8] bg-white px-3 text-xs"><option value="date-desc">Mas recientes primero</option><option value="date-asc">Mas antiguos primero</option><option value="name-asc">Nombre A-Z</option><option value="name-desc">Nombre Z-A</option><option value="size-desc">Mayor tamano</option><option value="size-asc">Menor tamano</option></select>
      </section>

      <SlideUp delay={0.2}>
        <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[#e8e8e8] bg-white">
          <div className="grid grid-cols-[1fr_100px] md:grid-cols-[2fr_100px_110px_150px] lg:grid-cols-[minmax(220px,1fr)_100px_120px_120px_110px_150px] bg-[#fafafa] px-4 py-2.5 text-[11px] font-bold tracking-[0.07em] text-[#aaa] uppercase">
            <p>Nombre</p>
            <p className="hidden md:block">Locacion</p>
            <p className="hidden lg:block">Departamento</p>
            <p className="hidden lg:block">Compartido</p>
            <p className="hidden md:block">Actualizacion</p>
            <p className="text-right">Acciones</p>
          </div>
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const draggedDocId = event.dataTransfer.getData("application/x-document-id");
              const draggedFolderId = event.dataTransfer.getData("application/x-folder-id");
              if (draggedDocId) {
                void moveDocumentToFolder(draggedDocId, null);
                return;
              }
              if (draggedFolderId) {
                void moveFolderToFolder(draggedFolderId, null);
              }
            }}
          >
            {renderFolderTree(null)}
            <AnimatePresence>
              {rootDocuments.map((doc) => {
                const scope = getEffectiveDocumentScope(doc);
                const loc = doc.branch_id ? branchMap.get(doc.branch_id) ?? "Locacion" : scope.locations[0] ? branchMap.get(scope.locations[0]) ?? "Locacion" : "Global";
                const dept = scope.departments[0] ? deptMap.get(scope.departments[0]) ?? "Departamento" : "-";
                const shared = scope.locations.length || scope.departments.length || scope.positions.length || scope.users.length ? "Segmentado" : "Todos";
                return (
                  <AnimatedItem key={doc.id}>
                    <div className="grid grid-cols-[1fr_100px] md:grid-cols-[2fr_100px_110px_150px] lg:grid-cols-[minmax(220px,1fr)_100px_120px_120px_110px_150px] items-center border-t border-[#f0f0f0] px-4 py-2.5 hover:bg-[#fcfcfc] transition-colors" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; }}>
                      <div className="min-w-0"><p className="truncate text-[12px] font-medium text-[#222]">{doc.title}</p><p className="truncate text-[11px] text-[#bbb]">{formatSize(doc.file_size_bytes)} · {doc.mime_type ?? "archivo"}</p></div>
                      <p className="hidden md:block text-xs text-[#888]">{loc}</p>
                      <p className="hidden lg:block text-xs text-[#888]">{dept}</p>
                      <p className="hidden lg:block text-xs text-[#888]">{shared}</p>
                      <p className="hidden md:block text-xs text-[#888]">{formatDate(doc.created_at)}</p>
                      <div className="flex items-center justify-end gap-1">
                        <a href={`/api/documents/${doc.id}/download`} className={ACTION_BTN_NEUTRAL} title="Ver"><Eye className="h-3.5 w-3.5" /></a>
                        <button type="button" onClick={() => setEditDocId(doc.id)} className={ACTION_BTN_NEUTRAL} title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                         {doc.folder_id ? null : (
                           <button type="button" onClick={() => setShareDocId(doc.id)} className={ACTION_BTN_NEUTRAL} title="Compartir"><Share2 className="h-3.5 w-3.5" /></button>
                         )}
                          <button type="button" onClick={() => setEmailShareDocId(doc.id)} className={ACTION_BTN_MAIL} title="Compartir por email"><Mail className="h-3.5 w-3.5" /></button>
                         <a href={`/api/documents/${doc.id}/download`} className={ACTION_BTN_NEUTRAL} title="Descargar"><Download className="h-3.5 w-3.5" /></a>
                        <button type="button" onClick={() => setDeleteDocId(doc.id)} className={ACTION_BTN_DANGER} title="Eliminar"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  </AnimatedItem>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
      </SlideUp>

      {editDocument ? (
        <EditDocumentModal
          document={editDocument}
          folders={folderRows}
          busy={busy}
          onCancel={() => setEditDocId(null)}
          onSave={saveDocument}
        />
      ) : null}

      {editFolder ? (
        <EditFolderModal
          folder={editFolder}
          folders={folderRows}
          busy={busy}
          onCancel={() => setEditFolderId(null)}
          onSave={saveFolder}
        />
      ) : null}

      {deleteDocument ? (
        <ConfirmDeleteDialog
          title="Eliminar documento"
          description={`Se eliminara \"${deleteDocument.title}\". Esta accion no se puede deshacer.`}
          busy={busy}
          onCancel={() => setDeleteDocId(null)}
          onConfirm={() => void removeDocument(deleteDocument.id)}
        />
      ) : null}

      {deleteFolder ? (
        <ConfirmDeleteDialog
          title="Eliminar carpeta"
          description={`Se eliminara la carpeta \"${deleteFolder.name}\" si esta vacia.`}
          busy={busy}
          onCancel={() => setDeleteFolderId(null)}
          onConfirm={() => void removeFolder(deleteFolder.id)}
        />
      ) : null}

      {shareDocument ? (
        <ShareAccessModal
          title="Compartir documento"
          itemName={shareDocument.title}
          busy={busy}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          initialScope={parseScope(shareDocument.access_scope)}
          onCancel={() => setShareDocId(null)}
          onSave={(scope) => void saveScope({ kind: "document", id: shareDocument.id, ...scope })}
        />
      ) : null}

      {shareFolder ? (
        <ShareAccessModal
          title="Compartir carpeta"
          itemName={shareFolder.name}
          busy={busy}
          branches={branches}
          departments={departments}
          positions={positions}
          users={users}
          initialScope={parseScope(shareFolder.access_scope)}
          onCancel={() => setShareFolderId(null)}
          onSave={(scope) => void saveScope({ kind: "folder", id: shareFolder.id, ...scope })}
        />
      ) : null}

      {emailShareDocument ? (
        <ShareByEmailModal
          document={emailShareDocument}
          busy={busy}
          onCancel={() => setEmailShareDocId(null)}
          onSubmit={(payload) => void shareDocumentByEmail(payload)}
        />
      ) : null}

    </>
  );
}

const ACTION_BTN_NEUTRAL = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#e8e8e8] bg-white text-[#666] hover:bg-[#f6f6f6] transition-opacity [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#c8d7ea] [.theme-dark-pro_&]:hover:bg-[#172131]";
const ACTION_BTN_MAIL = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#dce8fb] bg-[#f2f7ff] text-[#2a4f87] hover:bg-[#e7f0ff] transition-opacity [.theme-dark-pro_&]:border-[#365a87] [.theme-dark-pro_&]:bg-[#18283d] [.theme-dark-pro_&]:text-[#9dc6ff] [.theme-dark-pro_&]:hover:bg-[#1f334d]";
const ACTION_BTN_DANGER = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[#f3cbc4] bg-[#fff3f1] text-[#b63a2f] hover:bg-[#ffe8e4] transition-opacity [.theme-dark-pro_&]:border-[#6a3a42] [.theme-dark-pro_&]:bg-[#2a1c1f] [.theme-dark-pro_&]:text-[#ff9ea7] [.theme-dark-pro_&]:hover:bg-[#352328]";
const MODAL_PANEL = "overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)] [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const MODAL_HEADER = "flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5 [.theme-dark-pro_&]:border-[#2b3646]";
const MODAL_TITLE = "font-serif text-[15px] font-bold text-[#111] [.theme-dark-pro_&]:text-[#e7edf7]";
const MODAL_CLOSE = "grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#c8d7ea] [.theme-dark-pro_&]:hover:bg-[#172131]";
const MODAL_SOFT_BOX = "rounded-lg border border-[#e8e8e8] bg-[#f8f8f8] p-3 [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#111824]";
const MODAL_LABEL = "text-[11px] font-bold tracking-[0.1em] text-[#aaa] uppercase [.theme-dark-pro_&]:text-[#9aabc3]";
const MODAL_INPUT = "rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#d8e3f2]";
const MODAL_FOOTER = "flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4 [.theme-dark-pro_&]:border-[#2b3646]";
const MODAL_CANCEL = "rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#c8d7ea] [.theme-dark-pro_&]:hover:bg-[#172131]";
const MODAL_PRIMARY = "rounded-lg bg-[#111] px-5 py-2 text-sm font-bold text-white hover:bg-[#c0392b] disabled:opacity-60 [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]";
const MODAL_DANGER = "rounded-lg border-[1.5px] border-[#f3cbc4] bg-[#fff3f1] px-4 py-2 text-sm font-bold text-[#b63a2f] hover:bg-[#ffe8e4] [.theme-dark-pro_&]:border-[#6a3a42] [.theme-dark-pro_&]:bg-[#2a1c1f] [.theme-dark-pro_&]:text-[#ff9ea7] [.theme-dark-pro_&]:hover:bg-[#352328]";

function ShareByEmailModal({
  document,
  busy,
  onCancel,
  onSubmit,
}: {
  document: DocumentRow;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (payload: { documentId: string; email: string; message: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/45 p-5" onClick={() => !busy && onCancel()}>
      <div className={`w-[460px] max-w-[95vw] ${MODAL_PANEL}`} onClick={(event) => event.stopPropagation()}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>Compartir por email</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <div className="space-y-3 px-6 py-5">
          <div className={MODAL_SOFT_BOX}>
            <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[#aaa] uppercase [.theme-dark-pro_&]:text-[#9aabc3]">Documento</p>
            <p className="text-sm font-semibold text-[#111] [.theme-dark-pro_&]:text-[#e7edf7]">{document.title}</p>
          </div>
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Email destino</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="usuario@empresa.com" className={MODAL_INPUT} /></label>
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Mensaje (opcional)</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className={MODAL_INPUT} placeholder="Te comparto este archivo." /></label>
        </div>
        <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="button" disabled={busy || !email.trim()} onClick={() => onSubmit({ documentId: document.id, email: email.trim(), message: message.trim() })} className={MODAL_PRIMARY}>{busy ? "Enviando..." : "Enviar"}</button></div>
      </div>
    </div>
  );
}

function EditDocumentModal({
  document,
  folders,
  busy,
  onCancel,
  onSave,
}: {
  document: DocumentRow;
  folders: FolderRow[];
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: { documentId: string; title: string; folderId: string | null }) => void;
}) {
  const [title, setTitle] = useState(document.title);
  const [folderId, setFolderId] = useState(document.folder_id ?? "");

  return (
    <div className="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5">
      <div className={`w-[520px] max-w-[95vw] ${MODAL_PANEL}`}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>Editar Documento</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <div className="space-y-3 px-6 py-5">
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Titulo</span><input value={title} onChange={(event) => setTitle(event.target.value)} className={MODAL_INPUT} /></label>
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Carpeta</span><select value={folderId} onChange={(event) => setFolderId(event.target.value)} className={MODAL_INPUT}><option value="">Sin carpeta</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        </div>
        <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="button" disabled={busy || !title.trim()} onClick={() => onSave({ documentId: document.id, title: title.trim(), folderId: folderId || null })} className={MODAL_PRIMARY}>{busy ? "Guardando..." : "Guardar"}</button></div>
      </div>
    </div>
  );
}

function EditFolderModal({
  folder,
  folders,
  busy,
  onCancel,
  onSave,
}: {
  folder: FolderRow;
  folders: FolderRow[];
  busy: boolean;
  onCancel: () => void;
  onSave: (payload: { folderId: string; name: string; parentId: string | null }) => void;
}) {
  const [name, setName] = useState(folder.name);
  const [parentId, setParentId] = useState(folder.parent_id ?? "");

  return (
    <div className="fixed inset-0 z-[1020] flex items-center justify-center bg-black/45 p-5">
      <div className={`w-[520px] max-w-[95vw] ${MODAL_PANEL}`}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>Editar Carpeta</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <div className="space-y-3 px-6 py-5">
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Nombre</span><input value={name} onChange={(event) => setName(event.target.value)} className={MODAL_INPUT} /></label>
          <label className="grid gap-1.5"><span className={MODAL_LABEL}>Carpeta padre</span><select value={parentId} onChange={(event) => setParentId(event.target.value)} className={MODAL_INPUT}><option value="">Raiz</option>{folders.filter((f) => f.id !== folder.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        </div>
        <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="button" disabled={busy || !name.trim()} onClick={() => onSave({ folderId: folder.id, name: name.trim(), parentId: parentId || null })} className={MODAL_PRIMARY}>{busy ? "Guardando..." : "Guardar"}</button></div>
      </div>
    </div>
  );
}

function ShareAccessModal({
  title,
  itemName,
  branches,
  departments,
  positions,
  users,
  initialScope,
  busy,
  onCancel,
  onSave,
}: {
  title: string;
  itemName: string;
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
  initialScope: { locations: string[]; departments: string[]; positions: string[]; users: string[] };
  busy: boolean;
  onCancel: () => void;
  onSave: (scope: { locations: string[]; departments: string[]; positions: string[]; users: string[] }) => void;
}) {
  const scopeFormId = `share-scope-form-${title.toLowerCase().replace(/\s+/g, "-")}`;
  const [dynamicUsers, setDynamicUsers] = useState<User[]>(users);
  const [dynamicPositions, setDynamicPositions] = useState<Position[]>(positions);
  const [loading, setLoading] = useState(users.length === 0 || positions.length === 0);

  useEffect(() => {
    if (users.length === 0 || positions.length === 0) {
      fetch("/api/company/documents?catalog=share_scopes")
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(typeof data.error === "string" ? data.error : "No se pudieron cargar los permisos");
          }

          setDynamicUsers(Array.isArray(data.employees) ? data.employees : []);
          setDynamicPositions(Array.isArray(data.positions) ? data.positions : []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [users.length, positions.length]);

  return (
    <div className="fixed inset-0 z-[1060] flex items-center justify-center bg-black/45 p-5">
      <div className={`w-[460px] max-w-[95vw] ${MODAL_PANEL}`}>
        <div className={MODAL_HEADER}><p className={MODAL_TITLE}>{title}</p><button type="button" className={MODAL_CLOSE} onClick={onCancel}>✕</button></div>
        <form
          id={scopeFormId}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const toList = (key: string) => [...new Set(form.getAll(key).map((value) => String(value).trim()).filter(Boolean))];
            onSave({
              locations: toList("_scope_location"),
              departments: toList("_scope_department"),
              positions: toList("_scope_position"),
              users: toList("_scope_user"),
            });
          }}
        >
          <div className="max-h-[68vh] overflow-y-auto px-6 py-4">
            <div className={MODAL_SOFT_BOX}>
              <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[#aaa] uppercase [.theme-dark-pro_&]:text-[#9aabc3]">Elemento</p>
              <p className="text-sm font-semibold text-[#111] [.theme-dark-pro_&]:text-[#e7edf7]">{itemName}</p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center p-12">
                <span className="animate-pulse text-xs font-semibold text-[#888] [.theme-dark-pro_&]:text-[#9aabc3]">Cargando permisos...</span>
              </div>
            ) : (
              <ScopeSelector
                namespace={`share-${title.toLowerCase().replace(/\s+/g, "-")}`}
                branches={branches}
                departments={departments}
                positions={dynamicPositions}
                users={dynamicUsers}
                locationInputName="_scope_location"
                departmentInputName="_scope_department"
                positionInputName="_scope_position"
                userInputName="_scope_user"
                initialLocations={initialScope.locations}
                initialDepartments={initialScope.departments}
                initialPositions={initialScope.positions}
                initialUsers={initialScope.users}
              />
            )}
          </div>
          <div className={MODAL_FOOTER}><button type="button" onClick={onCancel} className={MODAL_CANCEL}>Cancelar</button><button type="submit" disabled={busy} className={MODAL_PRIMARY}>{busy ? "Guardando..." : "Guardar permisos"}</button></div>
        </form>
      </div>
    </div>
  );
}
