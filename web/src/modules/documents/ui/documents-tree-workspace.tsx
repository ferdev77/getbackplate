"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, MapPin, Pencil, Search, Share2, Trash2, ChevronRight, Folder, Mail } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { ScopePillsOverflow } from "@/shared/ui/scope-pills-overflow";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { FadeIn, SlideUp, AnimatedList, AnimatedItem } from "@/shared/ui/animations";
import { DocumentEditModal } from "@/modules/documents/ui/document-edit-modal";
import { FolderEditModal } from "@/modules/documents/ui/folder-edit-modal";
import { DocumentShareByEmailModal } from "@/modules/documents/ui/document-share-by-email-modal";
import { DocumentShareAccessModal } from "@/modules/documents/ui/document-share-access-modal";
import { DocumentPreviewPanel } from "@/modules/documents/ui/document-preview-panel";

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

type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type Props = {
  organizationId: string;
  viewerUserId: string;
  folders: FolderRow[];
  documents: DocumentRow[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
  customBrandingEnabled?: boolean;
  viewMode?: "tree" | "columns";
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

function isPreviewableMime(mimeType: string | null) {
  if (!mimeType) return false;
  return mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("text/");
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

export function DocumentsTreeWorkspace({ organizationId, viewerUserId, folders, documents, branches, departments, positions, users, customBrandingEnabled = false, viewMode = "tree" }: Props) {
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
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [selectedColumnDocId, setSelectedColumnDocId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ docId: string | null; status: "idle" | "loading" | "ready" | "error" }>({
    docId: null,
    status: "idle",
  });
  const [busy, setBusy] = useState(false);
  const [connectedUsersCount, setConnectedUsersCount] = useState<number | null>(null);
  const columnsScrollRef = useRef<HTMLDivElement | null>(null);
  const previousColumnCountRef = useRef(1);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.documents.columns.folder:${organizationId}:${viewerUserId}`;
    const currentFolderId = columnPath[columnPath.length - 1] ?? null;
    if (currentFolderId) {
      window.localStorage.setItem(key, currentFolderId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [columnPath, organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.documents.columns.folder:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);
    if (!stored) return;

    const frame = window.requestAnimationFrame(() => {
      setColumnPath((prev) => (prev[prev.length - 1] === stored ? prev : [stored]));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (columnPath.length === 0) return;
    const validFolderIds = new Set(folderRows.map((folder) => folder.id));
    if (columnPath.every((folderId) => validFolderIds.has(folderId))) return;
    setColumnPath((prev) => prev.filter((folderId) => validFolderIds.has(folderId)));
  }, [columnPath, folderRows]);

  const mappedBranches = useMemo(
    () => branches.map((b) => ({ ...b, name: customBrandingEnabled && b.city ? b.city : b.name })),
    [branches, customBrandingEnabled]
  );

  const branchMap = useMemo(() => new Map(mappedBranches.map((row) => [row.id, row.name])), [mappedBranches]);
  const deptMap = useMemo(() => new Map(departments.map((row) => [row.id, row.name])), [departments]);
  const positionMap = useMemo(() => new Map(positions.map((row) => [row.id, row])), [positions]);

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

  useEffect(() => {
    if (!organizationId || !viewerUserId) return;

    const channel = supabase.channel(`documents-presence-${organizationId}`, {
      config: {
        presence: {
          key: viewerUserId,
        },
      },
    });

    const computeConnectedUsers = () => {
      const state = channel.presenceState();
      const keys = Object.keys(state);
      setConnectedUsersCount(keys.length);
    };

    channel.on("presence", { event: "sync" }, computeConnectedUsers);
    channel.on("presence", { event: "join" }, computeConnectedUsers);
    channel.on("presence", { event: "leave" }, computeConnectedUsers);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          organization_id: organizationId,
          user_id: viewerUserId,
          online_at: new Date().toISOString(),
        });
      }

      if (status === "CLOSED" || status === "TIMED_OUT" || status === "CHANNEL_ERROR") {
        setConnectedUsersCount(0);
      }
    });

    return () => {
      setConnectedUsersCount(0);
      void supabase.removeChannel(channel);
    };
  }, [organizationId, viewerUserId, supabase]);

  const folderOptions = useMemo(() => folderRows.map((row) => ({ id: row.id, name: row.name })), [folderRows]);
  const folderById = useMemo(() => new Map(folderRows.map((row) => [row.id, row])), [folderRows]);

  function getEffectiveDocumentScope(doc: DocumentRow) {
    if (!doc.folder_id) return parseScope(doc.access_scope);
    return parseScope(folderById.get(doc.folder_id)?.access_scope ?? doc.access_scope);
  }

  // Locaciones del scope → nombres. Si no hay, array vacío = "Todas"
  function getScopeLocNames(scope: ReturnType<typeof parseScope>, branchId: string | null): string[] {
    const fromScope = scope.locations.map((id) => branchMap.get(id) ?? "Sucursal").filter(Boolean);
    if (fromScope.length > 0) return fromScope;
    if (branchId) return [branchMap.get(branchId) ?? "Sucursal"];
    return [];
  }

  // Deptos + Puestos combinados: igual que checklists scopeRoles
  // Departamento solo → "Cocina"
  // Puesto con depto → "Cocina: Chef"
  function getScopeRoles(scope: ReturnType<typeof parseScope>): { name: string, type: "department" | "position" }[] {
    const roles: { name: string, type: "department" | "position" }[] = [];
    for (const dId of scope.departments) {
      roles.push({ name: deptMap.get(dId) ?? "Depto", type: "department" });
    }
    for (const pId of scope.positions) {
      const p = positionMap.get(pId);
      if (!p) { roles.push({ name: "Puesto", type: "position" }); continue; }
      const dName = p.department_id ? (deptMap.get(p.department_id) ?? "Depto") : null;
      roles.push({ name: dName ? `${dName}: ${p.name}` : p.name, type: "position" });
    }
    return roles;
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
  const activeUsers = connectedUsersCount ?? users.length;
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

  async function saveDocument(payload: {
    documentId: string;
    title: string;
    folderId: string | null;
    scope?: { locations: string[]; departments: string[]; positions: string[]; users: string[] };
  }) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: payload.documentId,
          title: payload.title,
          folderId: payload.folderId,
          locationScope: payload.scope?.locations,
          departmentScope: payload.scope?.departments,
          positionScope: payload.scope?.positions,
          userScope: payload.scope?.users,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar documento");

      setDocumentRows((prev) =>
        prev.map((row) => {
          if (row.id === payload.documentId) {
            const newScopeString = payload.scope
              ? `locations:${payload.scope.locations.join(",")};departments:${payload.scope.departments.join(",")};positions:${payload.scope.positions.join(",")};users:${payload.scope.users.join(",")}`
              : row.access_scope;

            return { ...row, title: payload.title, folder_id: payload.folderId, access_scope: newScopeString };
          }
          return row;
        })
      );
      setEditDocId(null);
      toast.success("Documento actualizado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error actualizando documento");
    } finally {
      setBusy(false);
    }
  }

  async function saveFolder(payload: {
    folderId: string;
    name: string;
    parentId: string | null;
    scope?: { locations: string[]; departments: string[]; positions: string[]; users: string[] };
  }) {
    setBusy(true);
    try {
      const response = await fetch("/api/company/document-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: payload.folderId,
          name: payload.name,
          parentId: payload.parentId,
          locationScope: payload.scope?.locations,
          departmentScope: payload.scope?.departments,
          positionScope: payload.scope?.positions,
          userScope: payload.scope?.users,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo actualizar carpeta");

      setFolderRows((prev) =>
        prev.map((row) => {
          if (row.id === payload.folderId) {
            const newScopeString = payload.scope
              ? `locations:${payload.scope.locations.join(",")};departments:${payload.scope.departments.join(",")};positions:${payload.scope.positions.join(",")};users:${payload.scope.users.join(",")}`
              : row.access_scope;

            return { ...row, name: payload.name, parent_id: payload.parentId, access_scope: newScopeString };
          }
          return row;
        })
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
      const locNames = getScopeLocNames(scope, null);
      const roles = getScopeRoles(scope);

      const row = (
        <AnimatedItem key={folder.id}>
          <div className="border-b border-[var(--gbp-border)]">
            <div
              className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px] items-center gap-2 px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)] ${dropFolderId === folder.id ? "bg-[var(--gbp-accent-glow)]" : ""}`}
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
                <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--gbp-text2)] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-4 w-4 shrink-0 text-[var(--gbp-text2)]" />
                <span className="truncate text-[13px] font-semibold text-[var(--gbp-text)]">{folder.name}</span>
                <span className="shrink-0 text-[11px] text-[var(--gbp-muted)]">({docList.length})</span>
              </button>
              {/* Fecha de carga */}
              <p className="hidden text-xs text-[var(--gbp-text2)] md:block">{formatDate(folder.created_at)}</p>
              {/* Locación */}
              <div className="hidden lg:flex flex-wrap items-center gap-1">
                <ScopePillsOverflow
                  pills={locNames.map((n) => ({ name: n, type: "location" as const }))}
                  max={4}
                  emptyLabel={
                    <span className="inline-flex items-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--gbp-muted)]">
                      <MapPin className="mr-1 h-3 w-3" />Sin locacion
                    </span>
                  }
                />
              </div>
              {/* Deptos / Puestos */}
              <div className="hidden lg:flex flex-wrap items-center gap-1">
                <ScopePillsOverflow
                  pills={roles.map((r) => ({ name: r.name, type: r.type }))}
                  max={4}
                  emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">-</span>}
                />
              </div>
              {/* Acciones */}
              <div className="flex items-center justify-end gap-1">
                <button type="button" onClick={() => setEditFolderId(folder.id)} className={ACTION_BTN_NEUTRAL} ><Pencil className="h-3.5 w-3.5" /><TooltipLabel label="Editar carpeta" /></button>
                <button type="button" onClick={() => setShareFolderId(folder.id)} className={ACTION_BTN_NEUTRAL} ><Share2 className="h-3.5 w-3.5" /><TooltipLabel label="Compartir" /></button>
                <button type="button" onClick={() => setDeleteFolderId(folder.id)} className={ACTION_BTN_DANGER} ><Trash2 className="h-3.5 w-3.5" /><TooltipLabel label="Eliminar carpeta" /></button>
              </div>
            </div>
            <AnimatePresence>
              {isOpen && (
                <FadeIn delay={0.05}>
                  <div className="border-l-[3px] border-[var(--gbp-border)]">
                    {docList.map((doc) => {
                      const docScope = getEffectiveDocumentScope(doc);
                      const docLocNames = getScopeLocNames(docScope, doc.branch_id);
                      const docRoles = getScopeRoles(docScope);

                      return (
                        <div key={doc.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px] items-center gap-2 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; }}>
                          <div className="min-w-0 pl-8">
                            <p className="truncate text-[12px] font-medium text-[var(--gbp-text)]">{doc.title}</p>
                            <p className="truncate text-[11px] text-[var(--gbp-muted)]">{formatSize(doc.file_size_bytes)} · {doc.mime_type ?? "archivo"}</p>
                          </div>
                          {/* Fecha de carga */}
                          <p className="hidden text-xs text-[var(--gbp-text2)] md:block">{formatDate(doc.created_at)}</p>
                          {/* Locación */}
                          <div className="hidden lg:flex flex-wrap items-center gap-1">
                            <ScopePillsOverflow
                              pills={docLocNames.map((n) => ({ name: n, type: "location" as const }))}
                              max={4}
                              emptyLabel={
                                <span className="inline-flex items-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--gbp-muted)]">
                                  <MapPin className="mr-1 h-3 w-3" />Sin locacion
                                </span>
                              }
                            />
                          </div>
                          {/* Depto / Puestos */}
                          <div className="hidden lg:flex flex-wrap items-center gap-1">
                            <ScopePillsOverflow
                              pills={docRoles.map((r) => ({ name: r.name, type: r.type }))}
                              max={4}
                              emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">-</span>}
                            />
                          </div>
                          
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className={ACTION_BTN_NEUTRAL} ><Eye className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Ver/Descargar" /></a>
                            <button type="button" onClick={() => setEditDocId(doc.id)} className={ACTION_BTN_NEUTRAL} ><Pencil className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Editar" /></button>
                            {doc.folder_id ? null : (
                              <button type="button" onClick={() => setShareDocId(doc.id)} className={ACTION_BTN_NEUTRAL} ><Share2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir" /></button>
                            )}
                            <button type="button" onClick={() => setEmailShareDocId(doc.id)} className={ACTION_BTN_MAIL} ><Mail className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir por email" /></button>
                            <a href={`/api/documents/${doc.id}/download`} download className={ACTION_BTN_NEUTRAL} ><Download className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Descargar" /></a>
                            <button type="button" onClick={() => setDeleteDocId(doc.id)} className={ACTION_BTN_DANGER} ><Trash2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Eliminar" /></button>
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

  const visibleDocumentsByFolder = (() => {
    const map = new Map<string | null, DocumentRow[]>();
    for (const [parentId, rows] of docsByFolder.entries()) {
      map.set(parentId, sortDocuments(rows.filter(includeDocument)));
    }
    return map;
  })();

  const folderColumns = (() => {
    const levels: Array<{ parentId: string | null; folders: FolderRow[]; documents: DocumentRow[]; selectedFolderId: string | null }> = [];
    const depth = columnPath.length;
    for (let index = 0; index <= depth; index += 1) {
      const parentId = index === 0 ? null : columnPath[index - 1] ?? null;
      const selectedFolderId = columnPath[index] ?? null;
      const foldersAtLevel = [...(childrenByFolder.get(parentId) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "es"));
      const documentsAtLevel = visibleDocumentsByFolder.get(parentId) ?? [];
      levels.push({ parentId, folders: foldersAtLevel, documents: documentsAtLevel, selectedFolderId });
    }
    return levels;
  })();

  const selectedColumnDocument = useMemo(
    () => documentRows.find((doc) => doc.id === selectedColumnDocId) ?? null,
    [documentRows, selectedColumnDocId],
  );

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
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Carpetas</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{folderRows.length}</p><p className="text-[11px] text-[var(--gbp-muted)]">Con permisos activos</p></article></AnimatedItem>
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Total Documentos</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{totalDocuments}</p><p className="text-[11px] text-[var(--gbp-muted)]"><span className="text-[var(--gbp-success)]">+{Math.max(0, docsThisMonth - docsPrevMonth)}</span> este mes</p></article></AnimatedItem>
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Descargas (mes)</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{downloadsMonth}</p><p className="text-[11px] text-[var(--gbp-muted)]"><span className="text-[var(--gbp-success)]">↑ {downloadsTrend}%</span> vs anterior</p></article></AnimatedItem>
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Usuarios Activos</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{activeUsers}</p><p className="text-[11px] text-[var(--gbp-muted)]">{branches.length} locaciones</p></article></AnimatedItem>
      </AnimatedList>

      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gbp-muted)]" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} className="h-[34px] w-[220px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] pl-9 pr-3 text-xs" placeholder="Buscar documentos..." />
        </div>
        {viewMode === "tree" ? (
          <select value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="">Todas las carpetas</option>{folderOptions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
        ) : null}
        <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="">Todas las locaciones</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="">Todos los departamentos</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"><option value="date-desc">Mas recientes primero</option><option value="date-asc">Mas antiguos primero</option><option value="name-asc">Nombre A-Z</option><option value="name-desc">Nombre Z-A</option><option value="size-desc">Mayor tamano</option><option value="size-asc">Menor tamano</option></select>
      </section>

      <SlideUp delay={0.2}>
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
          <div className="grid grid-cols-[1fr_auto] gap-2 bg-[var(--gbp-bg)] px-4 py-3 text-[11px] font-bold tracking-[0.07em] text-[var(--gbp-muted)] uppercase md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px]">
            <p>Nombre</p>
            <p className="hidden md:block">Fecha de carga</p>
            <p className="hidden lg:block">Locación</p>
            <p className="hidden lg:block">Deptos / Puestos</p>
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
                const rLocNames = getScopeLocNames(scope, doc.branch_id);
                const rRoles = getScopeRoles(scope);
                return (
                  <AnimatedItem key={doc.id}>
                    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px] items-center gap-2 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable onDragStart={(event) => { event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; }}>
                      <div className="min-w-0"><p className="truncate text-[12px] font-medium text-[var(--gbp-text)]">{doc.title}</p><p className="truncate text-[11px] text-[var(--gbp-muted)]">{formatSize(doc.file_size_bytes)} · {doc.mime_type ?? "archivo"}</p></div>
                      {/* Fecha de carga */}
                      <p className="hidden text-xs text-[var(--gbp-text2)] md:block">{formatDate(doc.created_at)}</p>
                      {/* Locación */}
                      <div className="hidden lg:flex flex-wrap items-center gap-1">
                        <ScopePillsOverflow
                          pills={rLocNames.map((n) => ({ name: n, type: "location" as const }))}
                          max={4}
                          emptyLabel={
                            <span className="inline-flex items-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--gbp-muted)]">
                              <MapPin className="mr-1 h-3 w-3" />Sin locacion
                            </span>
                          }
                        />
                      </div>
                      {/* Depto / Puestos */}
                      <div className="hidden lg:flex flex-wrap items-center gap-1">
                        <ScopePillsOverflow
                          pills={rRoles.map((r) => ({ name: r.name, type: r.type }))}
                          max={4}
                          emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">-</span>}
                        />
                      </div>
                      {/* Acciones */}
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <a href={`/api/documents/${doc.id}/download`} target="_blank" rel="noopener noreferrer" className={ACTION_BTN_NEUTRAL} ><Eye className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Ver" /></a>
                        <button type="button" onClick={() => setEditDocId(doc.id)} className={ACTION_BTN_NEUTRAL} ><Pencil className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Editar" /></button>
                         {doc.folder_id ? null : (
                           <button type="button" onClick={() => setShareDocId(doc.id)} className={ACTION_BTN_NEUTRAL} ><Share2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir" /></button>
                         )}
                          <button type="button" onClick={() => setEmailShareDocId(doc.id)} className={ACTION_BTN_MAIL} ><Mail className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir por email" /></button>
                         <a href={`/api/documents/${doc.id}/download`} download className={ACTION_BTN_NEUTRAL} ><Download className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Descargar" /></a>
                        <button type="button" onClick={() => setDeleteDocId(doc.id)} className={ACTION_BTN_DANGER} ><Trash2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Eliminar" /></button>
                      </div>
                    </div>
                  </AnimatedItem>
                );
              })}
            </AnimatePresence>
          </div>
        </section>
        ) : (
          <section className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
            <div ref={columnsScrollRef} className="overflow-x-auto">
              <div className="flex min-h-[560px] divide-x divide-[var(--gbp-border)]">
                {folderColumns.map((column, index) => {
                  const parentFolder = column.parentId ? (folderById.get(column.parentId) ?? null) : null;
                  const isRootColumn = index === 0;
                  return (
                    <div key={`col-${index}-${column.parentId ?? "root"}`} className="w-[300px] shrink-0 bg-[var(--gbp-bg)] p-3">
                      <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">
                        {isRootColumn ? "Principal" : parentFolder?.name ?? "Carpeta"}
                      </p>
                      <div className="space-y-1">
                        {column.folders.map((folder) => (
                          <button
                            key={folder.id}
                            type="button"
                            onClick={() => {
                              setColumnPath((prev) => {
                                const next = prev.slice(0, index);
                                next[index] = folder.id;
                                return next;
                              });
                              setSelectedColumnDocId(null);
                            }}
                            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${column.selectedFolderId === folder.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
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
                            onClick={() => {
                              setSelectedColumnDocId(doc.id);
                              setPreviewState({
                                docId: doc.id,
                                status: isPreviewableMime(doc.mime_type) ? "loading" : "ready",
                              });
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-left ${selectedColumnDocId === doc.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                          >
                            <p className="truncate text-sm font-semibold text-[var(--gbp-text)]">{doc.title}</p>
                            <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">{formatDate(doc.created_at)} · {formatSize(doc.file_size_bytes)}</p>
                          </button>
                        ))}

                        {column.folders.length === 0 && column.documents.length === 0 ? (
                          <p className="rounded-lg border border-dashed border-[var(--gbp-border2)] px-3 py-8 text-center text-sm text-[var(--gbp-muted)]">Sin elementos para este nivel.</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {selectedColumnDocument ? (
                  <div className="min-w-[360px] flex-1 p-3">
                    <p className="mb-2 px-1 text-[11px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Detalle</p>
                    <div className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--gbp-text)]">{selectedColumnDocument.title}</p>
                        <p className="mt-1 text-xs text-[var(--gbp-text2)]">{formatDate(selectedColumnDocument.created_at)} · {formatSize(selectedColumnDocument.file_size_bytes)} · {selectedColumnDocument.mime_type ?? "archivo"}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`/api/documents/${selectedColumnDocument.id}/download`} target="_blank" rel="noopener noreferrer" className={ACTION_BTN_NEUTRAL}><Eye className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Ver" /></a>
                        <button type="button" onClick={() => setEditDocId(selectedColumnDocument.id)} className={ACTION_BTN_NEUTRAL}><Pencil className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Editar" /></button>
                        {selectedColumnDocument.folder_id ? null : (
                          <button type="button" onClick={() => setShareDocId(selectedColumnDocument.id)} className={ACTION_BTN_NEUTRAL}><Share2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir" /></button>
                        )}
                        <button type="button" onClick={() => setEmailShareDocId(selectedColumnDocument.id)} className={ACTION_BTN_MAIL}><Mail className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir por email" /></button>
                        <a href={`/api/documents/${selectedColumnDocument.id}/download`} download className={ACTION_BTN_NEUTRAL}><Download className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Descargar" /></a>
                        <button type="button" onClick={() => setDeleteDocId(selectedColumnDocument.id)} className={ACTION_BTN_DANGER}><Trash2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Eliminar" /></button>
                      </div>
                      <DocumentPreviewPanel
                        document={selectedColumnDocument}
                        previewState={previewState}
                        setPreviewState={setPreviewState}
                        isPreviewableMime={isPreviewableMime}
                      />
                      <div className="space-y-2">
                        {(() => {
                          const scope = getEffectiveDocumentScope(selectedColumnDocument);
                          const locs = getScopeLocNames(scope, selectedColumnDocument.branch_id);
                          const roles = getScopeRoles(scope);
                          return (
                            <>
                              <div>
                                <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Locaciones</p>
                                <ScopePillsOverflow pills={locs.map((name) => ({ name, type: "location" as const }))} max={6} emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">Todas</span>} />
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Deptos / Puestos</p>
                                <ScopePillsOverflow pills={roles.map((role) => ({ name: role.name, type: role.type }))} max={6} emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">Todos</span>} />
                              </div>
                            </>
                          );
                        })()}
                      </div>
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

      {editDocument ? (
        <DocumentEditModal
          document={editDocument}
          folders={folderRows}
          branches={mappedBranches}
          departments={departments}
          positions={positions}
          users={users}
          busy={busy}
          initialScope={parseScope(editDocument.access_scope)}
          onCancel={() => setEditDocId(null)}
          onSave={saveDocument}
        />
      ) : null}

      {editFolder ? (
        <FolderEditModal
          folder={editFolder}
          folders={folderRows}
          branches={mappedBranches}
          departments={departments}
          positions={positions}
          users={users}
          busy={busy}
          initialScope={parseScope(editFolder.access_scope)}
          onCancel={() => setEditFolderId(null)}
          onSave={saveFolder}
        />
      ) : null}

      {deleteDocument ? (
        <ConfirmDeleteDialog
          title="Eliminar documento"
          description={`Se eliminará \"${deleteDocument.title}\". Esta acción no se puede deshacer.`}
          busy={busy}
          onCancel={() => setDeleteDocId(null)}
          onConfirm={() => void removeDocument(deleteDocument.id)}
        />
      ) : null}

      {deleteFolder ? (
        <ConfirmDeleteDialog
          title="Eliminar carpeta"
          description={`Se eliminará la carpeta \"${deleteFolder.name}\" si está vacía.`}
          busy={busy}
          onCancel={() => setDeleteFolderId(null)}
          onConfirm={() => void removeFolder(deleteFolder.id)}
        />
      ) : null}

      {shareDocument ? (
        <DocumentShareAccessModal
          title="Compartir documento"
          itemName={shareDocument.title}
          busy={busy}
          branches={mappedBranches}
          departments={departments}
          positions={positions}
          users={users}
          initialScope={parseScope(shareDocument.access_scope)}
          onCancel={() => setShareDocId(null)}
          onSave={(scope) => void saveScope({ kind: "document", id: shareDocument.id, ...scope })}
        />
      ) : null}

      {shareFolder ? (
        <DocumentShareAccessModal
          title="Compartir carpeta"
          itemName={shareFolder.name}
          busy={busy}
          branches={mappedBranches}
          departments={departments}
          positions={positions}
          users={users}
          initialScope={parseScope(shareFolder.access_scope)}
          onCancel={() => setShareFolderId(null)}
          onSave={(scope) => void saveScope({ kind: "folder", id: shareFolder.id, ...scope })}
        />
      ) : null}

      {emailShareDocument ? (
        <DocumentShareByEmailModal
          document={emailShareDocument}
          busy={busy}
          onCancel={() => setEmailShareDocId(null)}
          onSubmit={(payload) => void shareDocumentByEmail(payload)}
        />
      ) : null}

    </>
  );
}

const ACTION_BTN_NEUTRAL = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-opacity hover:bg-[var(--gbp-surface2)] [.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_MAIL = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] transition-opacity hover:bg-[color:color-mix(in_oklab,var(--gbp-accent)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-accent-glow)] [.theme-dark-pro_&]:text-[var(--gbp-accent)]";
const ACTION_BTN_DANGER = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] transition-opacity hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

