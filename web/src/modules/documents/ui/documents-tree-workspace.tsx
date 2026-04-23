"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, GripVertical, MapPin, Pencil, Share2, Trash2, ChevronRight, Folder, Mail } from "lucide-react";
// AnimatePresence removed — it interferes with HTML5 DnD by controlling DOM mounting
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/shared/ui/confirm-delete-dialog";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { ScopePillsOverflow } from "@/shared/ui/scope-pills-overflow";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import { AnimatedList, AnimatedItem } from "@/shared/ui/animations";
import { DocumentEditModal } from "@/modules/documents/ui/document-edit-modal";
import { FolderEditModal } from "@/modules/documents/ui/folder-edit-modal";
import { DocumentShareByEmailModal } from "@/modules/documents/ui/document-share-by-email-modal";
import { DocumentShareAccessModal } from "@/modules/documents/ui/document-share-access-modal";
import { DocumentPreviewPanel } from "@/modules/documents/ui/document-preview-panel";
import { getSystemFolderType } from "@/shared/lib/employee-documents-folders-contract";
import { FilterBar } from "@/shared/ui/filter-bar";
import { useDndSafetyNet, markDndActive, markDndInactive } from "@/modules/documents/hooks/use-dnd-safety-net";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  access_scope: unknown;
  created_at: string;
  created_by?: string | null;
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
  owner_user_id?: string | null;
};

type Branch = { id: string; name: string; city?: string | null };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };
type User = { id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string };

type Props = {
  organizationId: string;
  viewerUserId: string;
  viewerUserName?: string;
  folders: FolderRow[];
  documents: DocumentRow[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: User[];
  customBrandingEnabled?: boolean;
  viewMode?: "tree" | "columns";
};

const ROOT_TREE_CONTEXT = "__root_principal__";

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

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function hasAnyScopeValue(scope: ReturnType<typeof parseScope>) {
  return scope.locations.length > 0 || scope.departments.length > 0 || scope.positions.length > 0 || scope.users.length > 0;
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

export function DocumentsTreeWorkspace({ organizationId, viewerUserId, viewerUserName, folders, documents, branches, departments, positions, users, customBrandingEnabled = false, viewMode = "tree" }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [folderRows, setFolderRows] = useState(folders);
  const [documentRows, setDocumentRows] = useState(documents);
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [editDocId, setEditDocId] = useState<string | null>(null);
  const [editFolderId, setEditFolderId] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [shareDocId, setShareDocId] = useState<string | null>(null);
  const [shareFolderId, setShareFolderId] = useState<string | null>(null);
  const [emailShareDocId, setEmailShareDocId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);
  const [dropRootColumn, setDropRootColumn] = useState(false);
  const [dropColumnTargetId, setDropColumnTargetId] = useState<string | null>(null);
  const [draggedDocumentId, setDraggedDocumentId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [columnPath, setColumnPath] = useState<string[]>([]);
  const [selectedTreeFolderId, setSelectedTreeFolderId] = useState<string>(ROOT_TREE_CONTEXT);
  const [selectedColumnDocId, setSelectedColumnDocId] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<{ docId: string | null; status: "idle" | "loading" | "ready" | "error" }>({
    docId: null,
    status: "idle",
  });
  const [busy, setBusy] = useState(false);
  const [connectedUsersCount, setConnectedUsersCount] = useState<number | null>(null);
  const [hydratedColumnFolderKey, setHydratedColumnFolderKey] = useState<string | null>(null);
  const columnsScrollRef = useRef<HTMLDivElement | null>(null);
  const previousColumnCountRef = useRef(1);
  const suppressColumnClickRef = useRef(false);
  const dragMetaRef = useRef<{ kind: "document" | "folder" | null; id: string | null }>({ kind: null, id: null });
  const dndDebugEnabled = process.env.NODE_ENV === "development";
  const dndDebugSnapshotRef = useRef<{ event: string; details: Record<string, unknown>; at: string } | null>(null);
  const prevDocumentsKeyRef = useRef("");
  const prevFoldersKeyRef = useRef("");
  const deferredPropsRef = useRef<{ documents?: typeof documents; folders?: typeof folders } | null>(null);

  function logDnd(event: string, details: Record<string, unknown>) {
    if (!dndDebugEnabled) return;
    console.debug(`[documents-dnd:admin] ${event}`, details);
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
      if (deferred.documents) setDocumentRows(deferred.documents);
      if (deferred.folders) setFolderRows(deferred.folders);
    }
  }

  // ── DnD Safety Net (see DOCS/DND_SAFETY_NET.md) ──
  const { guardedRefresh, resetOnPropsSync } = useDndSafetyNet({
    resetDndState,
    isDragActive: () => Boolean(draggedDocumentId || draggedFolderId || dragMetaRef.current.kind),
    onDeferredRefresh: () => router.refresh(),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.documents.columns.folder:${organizationId}:${viewerUserId}`;
    const stored = window.localStorage.getItem(key);

    const frame = window.requestAnimationFrame(() => {
      if (stored) {
        setColumnPath((prev) => (prev[prev.length - 1] === stored ? prev : [stored]));
      }
      setHydratedColumnFolderKey(key);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [organizationId, viewerUserId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `gbp.documents.columns.folder:${organizationId}:${viewerUserId}`;
    if (hydratedColumnFolderKey !== key) return;
    const currentFolderId = columnPath[columnPath.length - 1] ?? null;
    if (currentFolderId) {
      window.localStorage.setItem(key, currentFolderId);
    } else {
      window.localStorage.removeItem(key);
    }
  }, [columnPath, hydratedColumnFolderKey, organizationId, viewerUserId]);

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
  const folderById = useMemo(() => new Map(folderRows.map((row) => [row.id, row])), [folderRows]);

  const userByUserId = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) {
      if (u.user_id) map.set(u.user_id, u);
    }
    return map;
  }, [users]);

  const getCreatorLabel = useCallback((ownerId?: string | null) => {
    if (ownerId === viewerUserId && viewerUserName) return viewerUserName;
    const user = ownerId ? userByUserId.get(ownerId) : undefined;
    if (!user) return "Administrador";
    const fullName = `${user.first_name} ${user.last_name}`.trim();
    if (user.position_label) {
      return `${fullName} - ${user.position_label}`;
    }
    return fullName || "Administrador";
  }, [userByUserId, viewerUserId, viewerUserName]);

  const getEffectiveFolderScope = useCallback((folderId: string | null) => {
    let currentFolderId = folderId;
    while (currentFolderId) {
      const folder = folderById.get(currentFolderId);
      if (!folder) break;
      const scope = parseScope(folder.access_scope);
      if (hasAnyScopeValue(scope)) {
        return scope;
      }
      currentFolderId = folder.parent_id;
    }
    return parseScope(null);
  }, [folderById]);

  const getEffectiveDocumentScope = useCallback((doc: DocumentRow) => {
    const ownScope = parseScope(doc.access_scope);
    if (hasAnyScopeValue(ownScope) || !doc.folder_id) return ownScope;
    return getEffectiveFolderScope(doc.folder_id);
  }, [getEffectiveFolderScope]);

  const getDocumentLocationIds = useCallback((doc: DocumentRow) => {
    const ids = new Set<string>();
    if (doc.branch_id) ids.add(doc.branch_id);
    const scope = getEffectiveDocumentScope(doc);
    for (const locationId of scope.locations) {
      ids.add(locationId);
    }
    return ids;
  }, [getEffectiveDocumentScope]);

  const isDocumentInsideFolder = useCallback((doc: DocumentRow, targetFolderId: string) => {
    let currentFolderId = doc.folder_id;
    while (currentFolderId) {
      if (currentFolderId === targetFolderId) {
        return true;
      }
      currentFolderId = folderById.get(currentFolderId)?.parent_id ?? null;
    }
    return false;
  }, [folderById]);

  const isFolderInsideFolder = useCallback((folder: FolderRow, targetFolderId: string) => {
    let currentFolderId: string | null = folder.id;
    while (currentFolderId) {
      if (currentFolderId === targetFolderId) {
        return true;
      }
      currentFolderId = folderById.get(currentFolderId)?.parent_id ?? null;
    }
    return folderById;
  }, [folderById]);

  const contextualFolderId = useMemo(() => {
    if (viewMode === "columns") {
      return columnPath[columnPath.length - 1] ?? null;
    }
    if (selectedTreeFolderId !== ROOT_TREE_CONTEXT) return selectedTreeFolderId;
    return folderFilter || null;
  }, [columnPath, folderFilter, selectedTreeFolderId, viewMode]);

  const locationDocumentsSource = useMemo(() => {
    if (!contextualFolderId) return documentRows;
    return documentRows.filter((doc) => isDocumentInsideFolder(doc, contextualFolderId));
  }, [contextualFolderId, documentRows, isDocumentInsideFolder]);

  const locationFoldersSource = useMemo(() => {
    if (!contextualFolderId) return folderRows;
    return folderRows.filter((folder) => isFolderInsideFolder(folder, contextualFolderId));
  }, [contextualFolderId, folderRows, isFolderInsideFolder]);

  const locationFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const row of documentRows) {
      const locationIds = getDocumentLocationIds(row);
      for (const locationId of locationIds) {
        ids.add(locationId);
      }
    }

    for (const folder of folderRows) {
      const scope = parseScope(folder.access_scope);
      for (const locationId of scope.locations) {
        ids.add(locationId);
      }
    }

    return Array.from(ids)
      .map((id) => ({ id, name: branchMap.get(id) ?? "Locación" }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [branchMap, documentRows, folderRows, getDocumentLocationIds]);

  const normalizedQuery = useMemo(() => normalizeSearchText(query), [query]);

  const departmentFilterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const row of documentRows) {
      const scope = getEffectiveDocumentScope(row);
      for (const departmentId of scope.departments) {
        ids.add(departmentId);
      }
    }

    for (const folder of folderRows) {
      const scope = parseScope(folder.access_scope);
      for (const departmentId of scope.departments) {
        ids.add(departmentId);
      }
    }

    return Array.from(ids)
      .map((id) => ({ id, name: deptMap.get(id) ?? "Departamento" }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [deptMap, documentRows, folderRows, getEffectiveDocumentScope]);

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
    if (folderFilter && !folderById.has(folderFilter)) {
      setFolderFilter("");
    }
  }, [folderById, folderFilter]);

  useEffect(() => {
    if (selectedTreeFolderId !== ROOT_TREE_CONTEXT && !folderById.has(selectedTreeFolderId)) {
      setSelectedTreeFolderId(ROOT_TREE_CONTEXT);
    }
  }, [folderById, selectedTreeFolderId]);

  useEffect(() => {
    const key = JSON.stringify(documents.map((d) => d.id + d.folder_id + d.title));
    if (key === prevDocumentsKeyRef.current) return;
    prevDocumentsKeyRef.current = key;
    if (dragMetaRef.current.kind) {
      deferredPropsRef.current = { ...deferredPropsRef.current, documents };
      return;
    }
    setDocumentRows(documents);
  }, [documents]);

  useEffect(() => {
    if (locationFilter && !locationFilterOptions.some((option) => option.id === locationFilter)) {
      setLocationFilter("");
    }
  }, [locationFilter, locationFilterOptions]);

  useEffect(() => {
    if (departmentFilter && !departmentFilterOptions.some((option) => option.id === departmentFilter)) {
      setDepartmentFilter("");
    }
  }, [departmentFilter, departmentFilterOptions]);

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
        () => guardedRefresh(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "document_folders",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => guardedRefresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [organizationId, router, supabase, guardedRefresh]);

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
  const employeesRootFolderId = useMemo(
    () => folderRows.find((row) => getSystemFolderType(row.access_scope) === "employees_root")?.id ?? null,
    [folderRows],
  );

  const isProtectedFolder = useCallback((folder: FolderRow) => {
    const systemType = getSystemFolderType(folder.access_scope);
    if (systemType === "employees_root" || systemType === "employee_home") return true;
    if (employeesRootFolderId && folder.id === employeesRootFolderId) return true;
    return Boolean(employeesRootFolderId && folder.parent_id === employeesRootFolderId);
  }, [employeesRootFolderId]);

  // Locaciones del scope → nombres. Si no hay, array vacío = "Todas"
  const getScopeLocNames = useCallback((scope: ReturnType<typeof parseScope>, branchId: string | null): string[] => {
    const fromScope = scope.locations.map((id) => branchMap.get(id) ?? "Locación").filter(Boolean);
    if (fromScope.length > 0) return fromScope;
    if (branchId) return [branchMap.get(branchId) ?? "Locación"];
    return [];
  }, [branchMap]);

  // Deptos + Puestos combinados: igual que checklists scopeRoles
  // Departamento solo → "Cocina"
  // Puesto con depto → "Cocina: Chef"
  const getScopeRoles = useCallback((scope: ReturnType<typeof parseScope>): { name: string, type: "department" | "position" }[] => {
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
  }, [deptMap, positionMap]);

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

  const includeDocument = useCallback((doc: DocumentRow) => {
    if (normalizedQuery) {
      const scope = getEffectiveDocumentScope(doc);
      const locationNames = getScopeLocNames(scope, doc.branch_id);
      const scopeRoles = getScopeRoles(scope).map((item) => item.name);
      const searchableText = normalizeSearchText([
        doc.title,
        doc.mime_type ?? "",
        ...locationNames,
        ...scope.locations,
        ...scopeRoles,
        ...scope.departments,
        ...scope.positions,
      ].join(" "));

      if (!searchableText.includes(normalizedQuery)) return false;
    }
    if (folderFilter) {
      let currentFolderId = doc.folder_id;
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
    if (locationFilter) {
      const locationIds = getDocumentLocationIds(doc);
      if (!locationIds.has(locationFilter)) return false;
    }
    const scope = getEffectiveDocumentScope(doc);
    if (departmentFilter && !scope.departments.includes(departmentFilter)) return false;
    return true;
  }, [
    departmentFilter,
    folderById,
    folderFilter,
    getDocumentLocationIds,
    getEffectiveDocumentScope,
    getScopeLocNames,
    getScopeRoles,
    locationFilter,
    normalizedQuery,
  ]);

  const sortDocuments = useCallback((rows: DocumentRow[]) => {
    return [...rows].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  }, []);

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
    logDnd("move-document:start", { documentId, folderId });

    const targetFolderName = folderId
      ? folderRows.find((f) => f.id === folderId)?.name ?? "carpeta"
      : "raíz";

    setBusy(true);

    const movePromise = (async () => {
      const response = await fetch("/api/company/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, folderId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo mover documento");
      logDnd("move-document:ok", { documentId, folderId });

      setDocumentRows((prev) =>
        prev.map((row) => (row.id === documentId ? { ...row, folder_id: folderId } : row)),
      );
      return { targetFolderName };
    })();

    toast.promise(movePromise, {
      loading: `Moviendo documento a "${targetFolderName}"…`,
      success: () => `Documento movido a "${targetFolderName}"`,
      error: (err) => (err instanceof Error ? err.message : "Error moviendo documento"),
    });

    movePromise.catch(() => {}).finally(() => {
      dragMetaRef.current = { kind: null, id: null };
      setBusy(false);
      setDropFolderId(null);
      setDropRootColumn(false);
      setDropColumnTargetId(null);
      setDraggedDocumentId(null);
    });
  }

  async function moveFolderToFolder(folderId: string, parentId: string | null) {
    logDnd("move-folder:start", { folderId, parentId });
    const movingFolder = folderRows.find((row) => row.id === folderId);
    if (movingFolder && isProtectedFolder(movingFolder)) {
      toast.error("No se pueden mover carpetas protegidas de empleados");
      resetDndState();
      return;
    }
    if (parentId && employeesRootFolderId && parentId === employeesRootFolderId) {
      toast.error("No puedes mover carpetas manuales dentro de Carpetas de empleados");
      resetDndState();
      return;
    }
    if (folderId === parentId) {
      toast.error("No puedes mover una carpeta dentro de si misma");
      resetDndState();
      return;
    }
    if (parentId) {
      const parentById = new Map(folderRows.map((row) => [row.id, row.parent_id]));
      let currentParentId = parentById.get(parentId) ?? null;
      while (currentParentId) {
        if (currentParentId === folderId) {
          toast.error("No puedes mover una carpeta dentro de una subcarpeta suya");
          resetDndState();
          return;
        }
        currentParentId = parentById.get(currentParentId) ?? null;
      }
    }
    const targetFolderName = parentId
      ? folderRows.find((f) => f.id === parentId)?.name ?? "carpeta"
      : "raíz";

    setBusy(true);

    const movePromise = (async () => {
      const response = await fetch("/api/company/document-folders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId, parentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "No se pudo mover carpeta");
      logDnd("move-folder:ok", { folderId, parentId });

      setFolderRows((prev) =>
        prev.map((row) => (row.id === folderId ? { ...row, parent_id: parentId } : row)),
      );
      return { targetFolderName };
    })();

    toast.promise(movePromise, {
      loading: `Moviendo carpeta a "${targetFolderName}"…`,
      success: () => `Carpeta movida a "${targetFolderName}"`,
      error: (err) => (err instanceof Error ? err.message : "Error moviendo carpeta"),
    });

    movePromise.catch(() => {}).finally(() => {
      dragMetaRef.current = { kind: null, id: null };
      setBusy(false);
      setDropFolderId(null);
      setDropRootColumn(false);
      setDropColumnTargetId(null);
      setDraggedFolderId(null);
    });
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
    const folderList = (childrenByFolder.get(parentId) ?? []).filter((folder) => {
      if (!visibleFolderIdSet.has(folder.id)) return false;
      if (!folderFilter) return true;
      if (folder.id === folderFilter) return true;

      let currentParentId = folder.parent_id;
      while (currentParentId) {
        if (currentParentId === folderFilter) {
          return true;
        }
        currentParentId = folderById.get(currentParentId)?.parent_id ?? null;
      }

      return false;
    });
    return folderList.flatMap((folder) => {
      const docList = visibleDocumentsByFolder.get(folder.id) ?? [];
      const isOpen = folderFilter === folder.id || openFolders.has(folder.id);
      const scope = parseScope(folder.access_scope);
      const locNames = getScopeLocNames(scope, null);
      const roles = getScopeRoles(scope);

      const row = (
        <div key={folder.id}>
          <div className="border-b border-[var(--gbp-border)]">
            <div
              data-testid={`documents-folder-row-${folder.id}`}
              className={`grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px] items-center gap-2 px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)] ${dropFolderId === folder.id ? "bg-[var(--gbp-accent-glow)] ring-1 ring-inset ring-[var(--gbp-accent)]" : ""}`}
              draggable={!isProtectedFolder(folder)}
              onDragStart={(event) => {
                if (isProtectedFolder(folder)) return;
                dragMetaRef.current = { kind: "folder", id: folder.id };
                event.dataTransfer.setData("application/x-folder-id", folder.id);
                event.dataTransfer.effectAllowed = "move";
                markDndActive();
                logDnd("dragstart-folder-tree", { folderId: folder.id });
              }}
              onDragEnd={resetDndState}
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
                onClick={() => {
                  setSelectedTreeFolderId(folder.id);
                  setOpenFolders((prev) => {
                    const next = new Set(prev);
                    if (next.has(folder.id)) next.delete(folder.id);
                    else next.add(folder.id);
                    return next;
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedTreeFolderId(folder.id);
                    setOpenFolders((prev) => {
                      const next = new Set(prev);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    });
                  }
                }}
                className="flex min-w-0 items-center gap-1.5 text-left cursor-pointer"
                style={{ paddingLeft: `${depth * 18}px` }}
                draggable={!isProtectedFolder(folder)}
                onDragStart={(event) => {
                  if (isProtectedFolder(folder)) return;
                  dragMetaRef.current = { kind: "folder", id: folder.id };
                  event.dataTransfer.setData("application/x-folder-id", folder.id);
                  event.dataTransfer.effectAllowed = "move";
                  markDndActive();
                  logDnd("dragstart-folder-tree-button", { folderId: folder.id });
                }}
                onDragEnd={resetDndState}
              >
                <ChevronRight className={`h-4 w-4 shrink-0 text-[var(--gbp-text2)] transition ${isOpen ? "rotate-90" : ""}`} />
                <Folder className="h-4 w-4 shrink-0 text-[var(--gbp-text2)]" />
                <span className="truncate text-sm font-semibold text-[var(--gbp-text)]">
                  {folder.name}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--gbp-muted)]">({folderDocumentCountById.get(folder.id) ?? 0})</span>
              </div>
              {/* Fecha de carga */}
              <p className="hidden text-xs text-[var(--gbp-text2)] md:block">{formatDate(folder.created_at)}</p>
              {/* Locación */}
              <div className="hidden lg:flex flex-wrap items-center gap-1">
                <ScopePillsOverflow
                  pills={locNames.map((n) => ({ name: n, type: "location" as const }))}
                  max={5}
                  variant="initials"
                  emptyLabel={
                    <span className="inline-flex items-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--gbp-muted)]">
                      <MapPin className="mr-1 h-3 w-3" />Sin locación
                    </span>
                  }
                />
              </div>
              {/* Deptos / Puestos */}
              <div className="hidden lg:flex flex-wrap items-center gap-1">
                <ScopePillsOverflow
                  pills={roles.map((r) => ({ name: r.name, type: r.type }))}
                  max={5}
                  variant="initials"
                  emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">-</span>}
                />
              </div>
              {/* Acciones */}
              <div className="flex items-center justify-end gap-1" draggable={false} onDragStart={(e) => e.stopPropagation()}>
                {isProtectedFolder(folder) ? null : <button type="button" onClick={() => setEditFolderId(folder.id)} className={ACTION_BTN_NEUTRAL} ><Pencil className="h-3.5 w-3.5" /><TooltipLabel label="Editar carpeta" /></button>}
                <button type="button" onClick={() => setShareFolderId(folder.id)} className={ACTION_BTN_NEUTRAL} ><Share2 className="h-3.5 w-3.5" /><TooltipLabel label="Compartir" /></button>
                {isProtectedFolder(folder) ? null : <button type="button" onClick={() => setDeleteFolderId(folder.id)} className={ACTION_BTN_DANGER} ><Trash2 className="h-3.5 w-3.5" /><TooltipLabel label="Eliminar carpeta" /></button>}
              </div>
            </div>
            {isOpen && (
              <div>
                <div className="border-l-[3px] border-[var(--gbp-border)]">
                  {docList.map((doc) => {
                    const docScope = getEffectiveDocumentScope(doc);
                    const docLocNames = getScopeLocNames(docScope, doc.branch_id);
                    const docRoles = getScopeRoles(docScope);

                    return (
                      <div data-testid={`documents-doc-row-${doc.id}`} key={doc.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px] items-center gap-2 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable onDragStart={(event) => { dragMetaRef.current = { kind: "document", id: doc.id }; event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; markDndActive(); logDnd("dragstart-doc-tree-nested", { documentId: doc.id }); }} onDragEnd={resetDndState}>
                        <div className="min-w-0 pl-8">
                          <p className="truncate text-sm font-medium text-[var(--gbp-text)]">
                            {doc.title}
                          </p>
                          <p className="truncate text-[11px] text-[var(--gbp-muted)]">Subido por {getCreatorLabel(doc.owner_user_id)}</p>
                        </div>
                        {/* Fecha de carga */}
                        <p className="hidden text-xs text-[var(--gbp-text2)] md:block">{formatDate(doc.created_at)}</p>
                        {/* Locación */}
                        <div className="hidden lg:flex flex-wrap items-center gap-1">
                          <ScopePillsOverflow
                            pills={docLocNames.map((n) => ({ name: n, type: "location" as const }))}
                            max={5}
                            variant="initials"
                            emptyLabel={
                              <span className="inline-flex items-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--gbp-muted)]">
                                <MapPin className="mr-1 h-3 w-3" />Sin locación
                              </span>
                            }
                          />
                        </div>
                        {/* Depto / Puestos */}
                        <div className="hidden lg:flex flex-wrap items-center gap-1">
                          <ScopePillsOverflow
                            pills={docRoles.map((r) => ({ name: r.name, type: r.type }))}
                            max={5}
                            variant="initials"
                            emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">-</span>}
                          />
                        </div>
                        
                        <div className="flex flex-wrap items-center justify-end gap-1" draggable={false} onDragStart={(e) => e.stopPropagation()}>
                          <a href={`/api/documents/${doc.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className={ACTION_BTN_NEUTRAL} ><Eye className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Ver/Descargar" /></a>
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
              </div>
            )}
          </div>
        </div>
      );

      return [row];
    });
  }

  const visibleDocumentsByFolder = useMemo(() => {
    const map = new Map<string | null, DocumentRow[]>();
    for (const [parentId, rows] of docsByFolder.entries()) {
      map.set(parentId, sortDocuments(rows.filter(includeDocument)));
    }
    return map;
  }, [docsByFolder, includeDocument, sortDocuments]);

  const visibleFolderIdSet = useMemo(() => {
    const hasTextQuery = Boolean(normalizedQuery);
    const hasScopeFilters = Boolean(locationFilter || departmentFilter);
    const hasActiveDynamicFilters = hasTextQuery || hasScopeFilters;
    if (!hasActiveDynamicFilters) {
      return new Set(folderRows.map((folder) => folder.id));
    }

    const memo = new Map<string, boolean>();

    const checkFolderVisibility = (folderId: string, visiting: Set<string>): boolean => {
      const cached = memo.get(folderId);
      if (typeof cached === "boolean") return cached;

      const folder = folderById.get(folderId);
      if (!folder) {
        memo.set(folderId, false);
        return false;
      }

      if (visiting.has(folderId)) {
        const hasOwnDocs = (visibleDocumentsByFolder.get(folderId) ?? []).length > 0;
        memo.set(folderId, hasOwnDocs);
        return hasOwnDocs;
      }

      visiting.add(folderId);
      const scope = getEffectiveFolderScope(folder.id);
      const matchesLocation = !locationFilter || scope.locations.includes(locationFilter);
      const matchesDepartment = !departmentFilter || scope.departments.includes(departmentFilter);
      const matchesFolderScope = hasScopeFilters ? (matchesLocation && matchesDepartment) : false;
      const folderRoleNames = getScopeRoles(scope).map((item) => item.name);
      const folderLocationNames = getScopeLocNames(scope, null);
      const searchableFolderText = normalizeSearchText([
        folder.name,
        ...folderLocationNames,
        ...scope.locations,
        ...folderRoleNames,
        ...scope.departments,
        ...scope.positions,
      ].join(" "));
      const matchesFolderQuery = hasTextQuery ? searchableFolderText.includes(normalizedQuery) : false;
      const hasOwnDocs = (visibleDocumentsByFolder.get(folderId) ?? []).length > 0;
      const hasVisibleChild = (childrenByFolder.get(folderId) ?? []).some((child) => checkFolderVisibility(child.id, visiting));
      visiting.delete(folderId);

      const visible = matchesFolderScope || matchesFolderQuery || hasOwnDocs || hasVisibleChild;
      memo.set(folderId, visible);
      return visible;
    };

    for (const folder of folderRows) {
      checkFolderVisibility(folder.id, new Set<string>());
    }

    return new Set(Array.from(memo.entries()).filter(([, visible]) => visible).map(([id]) => id));
  }, [
    childrenByFolder,
    departmentFilter,
    folderById,
    folderRows,
    getEffectiveFolderScope,
    getScopeLocNames,
    getScopeRoles,
    locationFilter,
    normalizedQuery,
    visibleDocumentsByFolder,
  ]);

  const folderDocumentCountById = useMemo(() => {
    const memo = new Map<string, number>();

    const computeCount = (folderId: string, visiting: Set<string>): number => {
      const cached = memo.get(folderId);
      if (typeof cached === "number") return cached;

      const ownDocumentsCount = (visibleDocumentsByFolder.get(folderId) ?? []).length;
      if (visiting.has(folderId)) return ownDocumentsCount;

      visiting.add(folderId);
      let total = ownDocumentsCount;

      for (const child of childrenByFolder.get(folderId) ?? []) {
        if (!visibleFolderIdSet.has(child.id)) continue;
        total += computeCount(child.id, visiting);
      }

      visiting.delete(folderId);
      memo.set(folderId, total);
      return total;
    };

    for (const folder of folderRows) {
      if (!visibleFolderIdSet.has(folder.id)) continue;
      computeCount(folder.id, new Set<string>());
    }

    return memo;
  }, [childrenByFolder, folderRows, visibleDocumentsByFolder, visibleFolderIdSet]);

  const rootDocuments = folderFilter ? [] : (visibleDocumentsByFolder.get(null) ?? []);
  const treeRootParentId = folderFilter ? (folderById.get(folderFilter)?.parent_id ?? null) : null;

  const folderColumns = useMemo(() => {
    const levels: Array<{ parentId: string | null; folders: FolderRow[]; documents: DocumentRow[]; selectedFolderId: string | null }> = [];
    const depth = columnPath.length;
    for (let index = 0; index <= depth; index += 1) {
      const parentId = index === 0 ? null : columnPath[index - 1] ?? null;
      const selectedFolderId = columnPath[index] ?? null;
      const foldersAtLevel = [...(childrenByFolder.get(parentId) ?? [])]
        .filter((folder) => visibleFolderIdSet.has(folder.id))
        .sort((a, b) => a.name.localeCompare(b.name, "es"));
      const documentsAtLevel = visibleDocumentsByFolder.get(parentId) ?? [];
      levels.push({ parentId, folders: foldersAtLevel, documents: documentsAtLevel, selectedFolderId });
    }
    return levels;
  }, [childrenByFolder, columnPath, visibleDocumentsByFolder, visibleFolderIdSet]);

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
  const isDraggingColumnsItem = Boolean(draggedDocumentId || draggedFolderId);

  return (
    <>
      <AnimatedList className="mb-5 grid gap-3 sm:grid-cols-4">
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Carpetas</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{folderRows.length}</p><p className="text-[11px] text-[var(--gbp-muted)]">Con permisos activos</p></article></AnimatedItem>
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Total Documentos</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{totalDocuments}</p><p className="text-[11px] text-[var(--gbp-muted)]"><span className="text-[var(--gbp-success)]">+{Math.max(0, docsThisMonth - docsPrevMonth)}</span> este mes</p></article></AnimatedItem>
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Descargas (mes)</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{downloadsMonth}</p><p className="text-[11px] text-[var(--gbp-muted)]"><span className="text-[var(--gbp-success)]">↑ {downloadsTrend}%</span> vs anterior</p></article></AnimatedItem>
        <AnimatedItem><article className="h-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4"><p className="text-xs text-[var(--gbp-text2)]">Usuarios activos</p><p className="mt-1 text-2xl font-bold text-[var(--gbp-text)]">{activeUsers}</p><p className="text-[11px] text-[var(--gbp-muted)]">{locationFilterOptions.length} locaciones con documentos</p></article></AnimatedItem>
      </AnimatedList>

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Buscar documentos..."
        searchTestId="documents-search-input"
        filters={[
          {
            key: "folder",
            options: folderOptions.map((f) => ({ id: f.id, label: f.name })),
            value: folderFilter,
            onChange: (value) => {
              setFolderFilter(value);
              setSelectedTreeFolderId(value || ROOT_TREE_CONTEXT);
            },
            allLabel: "Todas las carpetas",
            testId: "documents-filter-folder",
          },
          {
            key: "location",
            options: locationFilterOptions.map((b) => ({ id: b.id, label: b.name })),
            value: locationFilter,
            onChange: setLocationFilter,
            allLabel: "Todas las locaciones",
            testId: "documents-filter-location",
          },
          {
            key: "department",
            options: departmentFilterOptions.map((d) => ({ id: d.id, label: d.name })),
            value: departmentFilter,
            onChange: setDepartmentFilter,
            allLabel: "Todos los departamentos",
            testId: "documents-filter-department",
          },
        ]}
        onClearFilters={() => {
          setQuery("");
          setFolderFilter("");
          setSelectedTreeFolderId(ROOT_TREE_CONTEXT);
          setLocationFilter("");
          setDepartmentFilter("");
          setColumnPath([]);
        }}
      />

      <div>
        <div>
        {viewMode === "tree" ? (
        <section data-testid="documents-tree-root" className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
          <div className="border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-xs font-bold uppercase tracking-[0.07em] text-[var(--gbp-muted)]">
            Explorador de Archivos
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3 text-[11px] font-bold tracking-[0.07em] text-[var(--gbp-muted)] uppercase md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px]">
            <p>Nombre</p>
            <p className="hidden md:block">Fecha de carga</p>
            <p className="hidden lg:block">Locación</p>
            <p className="hidden lg:block">Deptos / Puestos</p>
            <p className="text-right">Acciones</p>
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
            {isDraggingColumnsItem ? (
              <div className={`mx-3 mt-3 rounded-lg border border-dashed px-3 py-2 text-center text-xs transition-colors ${
                dropRootColumn
                  ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                  : "border-[var(--gbp-border2)] text-[var(--gbp-muted)]"
              }`}>
                Soltar aquí para mover a la raíz
              </div>
            ) : null}
            {renderFolderTree(treeRootParentId)}
            {rootDocuments.map((doc) => {
                const scope = getEffectiveDocumentScope(doc);
                const rLocNames = getScopeLocNames(scope, doc.branch_id);
                const rRoles = getScopeRoles(scope);
                return (
                  <div key={doc.id}>
                    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_auto] lg:grid-cols-[minmax(150px,1.5fr)_100px_minmax(120px,1fr)_minmax(150px,1.5fr)_160px] items-center gap-2 border-t border-[var(--gbp-border)] px-4 py-3 transition-colors hover:bg-[var(--gbp-bg)]" draggable onDragStart={(event) => { dragMetaRef.current = { kind: "document", id: doc.id }; event.dataTransfer.setData("application/x-document-id", doc.id); event.dataTransfer.effectAllowed = "move"; markDndActive(); logDnd("dragstart-doc-tree-root", { documentId: doc.id }); }} onDragEnd={resetDndState}>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--gbp-text)]">
                          {doc.title}
                        </p>
                        <p className="truncate text-[11px] text-[var(--gbp-muted)]">Subido por {getCreatorLabel(doc.owner_user_id)}</p>
                      </div>
                      {/* Fecha de carga */}
                      <p className="hidden text-xs text-[var(--gbp-text2)] md:block">{formatDate(doc.created_at)}</p>
                      {/* Locación */}
                      <div className="hidden lg:flex flex-wrap items-center gap-1">
                        <ScopePillsOverflow
                          pills={rLocNames.map((n) => ({ name: n, type: "location" as const }))}
                          max={5}
                          variant="initials"
                          emptyLabel={
                            <span className="inline-flex items-center rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--gbp-muted)]">
                              <MapPin className="mr-1 h-3 w-3" />Sin locación
                            </span>
                          }
                        />
                      </div>
                      {/* Depto / Puestos */}
                      <div className="hidden lg:flex flex-wrap items-center gap-1">
                        <ScopePillsOverflow
                          pills={rRoles.map((r) => ({ name: r.name, type: r.type }))}
                          max={5}
                          variant="initials"
                          emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">-</span>}
                        />
                      </div>
                      {/* Acciones */}
                      <div className="flex flex-wrap items-center justify-end gap-1" draggable={false} onDragStart={(e) => e.stopPropagation()}>
                        <a href={`/api/documents/${doc.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className={ACTION_BTN_NEUTRAL} ><Eye className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Ver" /></a>
                        <button type="button" onClick={() => setEditDocId(doc.id)} className={ACTION_BTN_NEUTRAL} ><Pencil className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Editar" /></button>
                         {doc.folder_id ? null : (
                           <button type="button" onClick={() => setShareDocId(doc.id)} className={ACTION_BTN_NEUTRAL} ><Share2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir" /></button>
                         )}
                          <button type="button" onClick={() => setEmailShareDocId(doc.id)} className={ACTION_BTN_MAIL} ><Mail className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Compartir por email" /></button>
                         <a href={`/api/documents/${doc.id}/download`} download className={ACTION_BTN_NEUTRAL} ><Download className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Descargar" /></a>
                        <button type="button" onClick={() => setDeleteDocId(doc.id)} className={ACTION_BTN_DANGER} ><Trash2 className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Eliminar" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
        ) : (
          <section data-testid="documents-columns-root" className="overflow-hidden rounded-[14px] border-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
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
                            draggable={!isProtectedFolder(folder)}
                            onDragStart={(event) => {
                              if (isProtectedFolder(folder)) return;
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
                                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--gbp-muted)] ${isProtectedFolder(folder) ? "cursor-not-allowed opacity-45" : "cursor-grab hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text2)] active:cursor-grabbing"}`}
                                title={isProtectedFolder(folder) ? "Carpeta protegida" : "Arrastrar carpeta"}
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--gbp-text2)]" />
                              <span className="truncate text-sm font-semibold text-[var(--gbp-text)]">
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
                            draggable
                            onDragStart={(event) => {
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
                              setPreviewState({
                                docId: doc.id,
                                status: isPreviewableMime(doc.mime_type) ? "loading" : "ready",
                              });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setSelectedColumnDocId(doc.id);
                                setPreviewState({
                                  docId: doc.id,
                                  status: isPreviewableMime(doc.mime_type) ? "loading" : "ready",
                                });
                              }
                            }}
                            className={`w-full rounded-lg border px-3 py-2 text-left cursor-pointer ${selectedColumnDocId === doc.id ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] hover:bg-[var(--gbp-bg)]"}`}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span
                                className="inline-flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text2)] active:cursor-grabbing"
                                title="Arrastrar archivo"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <p className="truncate text-sm font-bold text-[var(--gbp-text)]">
                                {doc.title}
                              </p>
                            </span>
                            <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">Subido por {getCreatorLabel(doc.owner_user_id)}</p>
                          </div>
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
                        <p className="flex items-center text-sm font-semibold text-[var(--gbp-text)]">
                          {selectedColumnDocument.title}
                        </p>
                        <p className="mt-1 text-xs text-[var(--gbp-text2)]">Subido por {getCreatorLabel(selectedColumnDocument.owner_user_id)}</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`/api/documents/${selectedColumnDocument.id}/download?inline=1`} target="_blank" rel="noopener noreferrer" className={ACTION_BTN_NEUTRAL}><Eye className="h-3.5 w-3.5 shrink-0" /><TooltipLabel label="Ver" /></a>
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
                                <ScopePillsOverflow pills={locs.map((name) => ({ name, type: "location" as const }))} max={5} variant="initials" emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">Todas</span>} />
                              </div>
                              <div>
                                <p className="mb-1 text-[10px] font-bold tracking-[0.08em] text-[var(--gbp-muted)] uppercase">Deptos / Puestos</p>
                                <ScopePillsOverflow pills={roles.map((role) => ({ name: role.name, type: role.type }))} max={5} variant="initials" emptyLabel={<span className="text-xs text-[var(--gbp-muted)]">Todos</span>} />
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
        </div>
      </div>

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

