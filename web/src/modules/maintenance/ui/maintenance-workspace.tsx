"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, FileText, ImageIcon, Loader2, MessageSquare, Paperclip, Plus, Search, Send, Settings2, Wrench, X } from "lucide-react";
import { toast } from "sonner";

import {
  type MaintenanceCatalog,
  type MaintenanceCategoryOption,
  type MaintenanceIssueOption,
  type MaintenanceRequest,
  type MaintenanceServiceItemOption,
  type MaintenanceStatus,
  type MaintenanceUpdate,
} from "@/modules/maintenance/types";

type BranchOption = {
  id: string;
  name: string;
};

type MaintenanceWorkspaceProps = {
  mode: "company" | "employee";
  apiBase: "/api/company/maintenance" | "/api/employee/maintenance";
  canCreate: boolean;
  canRespond: boolean;
  initialRequests: MaintenanceRequest[];
  currentUserId: string;
  initialCatalog: MaintenanceCatalog;
  branches: BranchOption[];
};

type MaintenanceRequestFormState = {
  branchId: string;
  priority: string;
  category: string;
  serviceItem: string;
  issue: string;
  title: string;
  description: string;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function deriveFormState(branches: BranchOption[], request?: MaintenanceRequest | null): MaintenanceRequestFormState {
  return {
    branchId: request?.branchId ?? branches[0]?.id ?? "",
    priority: request?.priority ?? "medium",
    category: request?.category ?? "",
    serviceItem: request?.serviceItem ?? "",
    issue: request?.issue ?? "",
    title: request?.title ?? "",
    description: request?.description ?? "",
  };
}

function CatalogManagerRow({
  label,
  name,
  isPending,
  onRename,
  onDelete,
}: {
  label: string;
  name: string;
  isPending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draftName, setDraftName] = useState(name);

  useEffect(() => {
    setDraftName(name);
  }, [name]);

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-1.5">
      <span className="min-w-20 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">{label}</span>
      <input
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        className="h-8 flex-1 rounded border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 text-xs"
      />
      <button
        type="button"
        onClick={() => onRename(draftName)}
        disabled={isPending || !draftName.trim() || draftName.trim() === name}
        className="h-8 rounded border border-[var(--gbp-border)] px-2 text-[11px] font-semibold disabled:opacity-50"
      >
        Guardar
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending}
        className="h-8 rounded border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] px-2 text-[11px] font-semibold text-[var(--gbp-error)] disabled:opacity-50"
      >
        Eliminar
      </button>
    </div>
  );
}

function SearchableCreatableField({
  label,
  value,
  onChange,
  options,
  placeholder,
  name,
  disabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLowerCase();
  const filtered = options.filter((option) => option.toLowerCase().includes(query)).slice(0, 8);
  const exactMatch = options.some((option) => normalizeLabel(option) === normalizeLabel(value));

  return (
    <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
      {label}
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <div className={`flex items-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 ${disabled ? "opacity-60" : ""}`}>
          <Search className="h-4 w-4 text-[var(--gbp-muted)]" />
          <input
            value={value}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 120)}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            className="w-full bg-transparent text-sm font-normal text-[var(--gbp-text)] outline-none placeholder:text-[var(--gbp-muted)]"
          />
        </div>
        {open && !disabled ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2 shadow-xl">
            {filtered.length ? (
              <div className="space-y-1">
                {filtered.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onChange(option);
                      setOpen(false);
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
                  >
                    {option}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-sm text-[var(--gbp-muted)]">Sin coincidencias.</p>
            )}
            {value.trim() && !exactMatch ? (
              <div className="mt-2 rounded-lg border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-text2)]">
                Se guardara como nueva opcion al crear o actualizar la request.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </label>
  );
}

function MaintenanceCatalogManager({
  catalog,
  onCatalogChange,
}: {
  catalog: MaintenanceCatalog;
  onCatalogChange: (next: MaintenanceCatalog) => void;
}) {
  const [isPending, setIsPending] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [managerCategoryId, setManagerCategoryId] = useState(catalog.categories[0]?.id ?? "");
  const [newServiceItemName, setNewServiceItemName] = useState("");
  const [managerServiceItemId, setManagerServiceItemId] = useState("");
  const [newIssueName, setNewIssueName] = useState("");

  useEffect(() => {
    if (!catalog.categories.some((category) => category.id === managerCategoryId)) {
      setManagerCategoryId(catalog.categories[0]?.id ?? "");
    }
  }, [catalog.categories, managerCategoryId]);

  const currentCategoryServiceItems = useMemo(
    () => catalog.serviceItems.filter((item) => item.categoryId === managerCategoryId),
    [catalog.serviceItems, managerCategoryId],
  );

  useEffect(() => {
    if (!currentCategoryServiceItems.some((item) => item.id === managerServiceItemId)) {
      setManagerServiceItemId(currentCategoryServiceItems[0]?.id ?? "");
    }
  }, [currentCategoryServiceItems, managerServiceItemId]);

  const currentIssues = useMemo(
    () => catalog.issues.filter((issue) => issue.serviceItemId === managerServiceItemId),
    [catalog.issues, managerServiceItemId],
  );

  async function runRequest(input: {
    url: string;
    method: "POST" | "PATCH" | "DELETE";
    body?: Record<string, string>;
    successMessage: string;
    apply: (current: MaintenanceCatalog, payload: Record<string, unknown>) => MaintenanceCatalog;
  }) {
    setIsPending(true);
    try {
      const response = await fetch(input.url, {
        method: input.method,
        headers: input.body ? { "content-type": "application/json" } : undefined,
        body: input.body ? JSON.stringify(input.body) : undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "No se pudo guardar");
      onCatalogChange(input.apply(catalog, payload as Record<string, unknown>));
      toast.success(input.successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
      <div>
        <p className="text-sm font-bold text-[var(--gbp-text)]">Gestionar catalogo</p>
        <p className="mt-1 text-xs text-[var(--gbp-text2)]">Crea, renombra o elimina categorias, items e issues sin salir del flujo.</p>
      </div>

      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="Nueva categoria"
            className="h-9 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void runRequest({
              url: "/api/company/maintenance/categories",
              method: "POST",
              body: { name: newCategoryName.trim() },
              successMessage: "Categoria creada",
              apply: (current, payload) => ({
                ...current,
                categories: [...current.categories, payload.category as MaintenanceCategoryOption].sort((a, b) => a.name.localeCompare(b.name)),
              }),
            }).then(() => setNewCategoryName(""))}
            disabled={isPending || !newCategoryName.trim()}
            className="h-9 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        <div className="space-y-2">
          {catalog.categories.map((category) => (
            <CatalogManagerRow
              key={category.id}
              label="Cat"
              name={category.name}
              isPending={isPending}
              onRename={(name) => void runRequest({
                url: `/api/company/maintenance/categories/${category.id}`,
                method: "PATCH",
                body: { name: name.trim() },
                successMessage: "Categoria actualizada",
                apply: (current, payload) => ({
                  ...current,
                  categories: current.categories.map((item) => item.id === category.id ? payload.category as MaintenanceCategoryOption : item),
                }),
              })}
              onDelete={() => void runRequest({
                url: `/api/company/maintenance/categories/${category.id}`,
                method: "DELETE",
                successMessage: "Categoria eliminada",
                apply: (current) => {
                  const remainingServiceItems = current.serviceItems.filter((item) => item.categoryId !== category.id);
                  const remainingServiceItemIds = new Set(remainingServiceItems.map((item) => item.id));
                  return {
                    ...current,
                    categories: current.categories.filter((item) => item.id !== category.id),
                    serviceItems: remainingServiceItems,
                    issues: current.issues.filter((issue) => remainingServiceItemIds.has(issue.serviceItemId)),
                  };
                },
              })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
        <select
          value={managerCategoryId}
          onChange={(event) => setManagerCategoryId(event.target.value)}
          className="h-9 w-full rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm"
        >
          {catalog.categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={newServiceItemName}
            onChange={(event) => setNewServiceItemName(event.target.value)}
            placeholder="Nuevo item de servicio"
            className="h-9 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void runRequest({
              url: "/api/company/maintenance/service-items",
              method: "POST",
              body: { categoryId: managerCategoryId, name: newServiceItemName.trim() },
              successMessage: "Item creado",
              apply: (current, payload) => ({
                ...current,
                serviceItems: [...current.serviceItems, payload.serviceItem as MaintenanceServiceItemOption].sort((a, b) => a.name.localeCompare(b.name)),
              }),
            }).then(() => setNewServiceItemName(""))}
            disabled={isPending || !managerCategoryId || !newServiceItemName.trim()}
            className="h-9 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        <div className="space-y-2">
          {currentCategoryServiceItems.map((item) => (
            <CatalogManagerRow
              key={item.id}
              label="Item"
              name={item.name}
              isPending={isPending}
              onRename={(name) => void runRequest({
                url: `/api/company/maintenance/service-items/${item.id}`,
                method: "PATCH",
                body: { name: name.trim() },
                successMessage: "Item actualizado",
                apply: (current, payload) => ({
                  ...current,
                  serviceItems: current.serviceItems.map((entry) => entry.id === item.id ? payload.serviceItem as MaintenanceServiceItemOption : entry),
                }),
              })}
              onDelete={() => void runRequest({
                url: `/api/company/maintenance/service-items/${item.id}`,
                method: "DELETE",
                successMessage: "Item eliminado",
                apply: (current) => ({
                  ...current,
                  serviceItems: current.serviceItems.filter((entry) => entry.id !== item.id),
                  issues: current.issues.filter((issue) => issue.serviceItemId !== item.id),
                }),
              })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
        <select
          value={managerServiceItemId}
          onChange={(event) => setManagerServiceItemId(event.target.value)}
          className="h-9 w-full rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm"
        >
          {currentCategoryServiceItems.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            value={newIssueName}
            onChange={(event) => setNewIssueName(event.target.value)}
            placeholder="Nuevo issue"
            className="h-9 flex-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 text-sm"
          />
          <button
            type="button"
            onClick={() => void runRequest({
              url: "/api/company/maintenance/issues",
              method: "POST",
              body: { serviceItemId: managerServiceItemId, name: newIssueName.trim() },
              successMessage: "Issue creado",
              apply: (current, payload) => ({
                ...current,
                issues: [...current.issues, payload.issue as MaintenanceIssueOption].sort((a, b) => a.name.localeCompare(b.name)),
              }),
            }).then(() => setNewIssueName(""))}
            disabled={isPending || !managerServiceItemId || !newIssueName.trim()}
            className="h-9 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white disabled:opacity-60"
          >
            Agregar
          </button>
        </div>
        <div className="space-y-2">
          {currentIssues.map((issue) => (
            <CatalogManagerRow
              key={issue.id}
              label="Issue"
              name={issue.name}
              isPending={isPending}
              onRename={(name) => void runRequest({
                url: `/api/company/maintenance/issues/${issue.id}`,
                method: "PATCH",
                body: { name: name.trim() },
                successMessage: "Issue actualizado",
                apply: (current, payload) => ({
                  ...current,
                  issues: current.issues.map((entry) => entry.id === issue.id ? payload.issue as MaintenanceIssueOption : entry),
                }),
              })}
              onDelete={() => void runRequest({
                url: `/api/company/maintenance/issues/${issue.id}`,
                method: "DELETE",
                successMessage: "Issue eliminado",
                apply: (current) => ({
                  ...current,
                  issues: current.issues.filter((entry) => entry.id !== issue.id),
                }),
              })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const STATUS_TABS: Array<{ value: string; label: string }> = [
  { value: "open", label: "Abiertas" },
  { value: "draft", label: "Borradores" },
  { value: "completed", label: "Resueltas" },
  { value: "cancelled", label: "Canceladas" },
  { value: "all", label: "Todas" },
];

const STATUS_LABELS: Record<MaintenanceStatus, string> = {
  draft: "Borrador",
  submitted: "Enviada",
  visit_scheduled: "Visita programada",
  in_progress: "En progreso",
  needs_parts: "Requiere repuesto",
  needs_followup: "Requiere otra visita",
  resolved: "Resuelta",
  cancelled: "Cancelada",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

const RESPOND_STATUSES: Array<{ value: "schedule_visit" | MaintenanceStatus; label: string }> = [
  { value: "schedule_visit", label: "Programar visita" },
  { value: "in_progress", label: "En progreso" },
  { value: "needs_parts", label: "Requiere repuesto" },
  { value: "resolved", label: "Resuelta" },
  { value: "cancelled", label: "Cancelada" },
];

function defaultResponseStatus(request: MaintenanceRequest | null): "schedule_visit" | MaintenanceStatus {
  if (!request) return "in_progress";
  if (request.status === "visit_scheduled" || request.status === "needs_followup") return "schedule_visit";
  if (RESPOND_STATUSES.some((status) => status.value === request.status)) return request.status;
  return "in_progress";
}

function dateLabel(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function visitDateLabel(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
  }).format(date);
}

function statusClassName(status: MaintenanceStatus) {
  if (status === "resolved") return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
  if (status === "cancelled") return "bg-rose-500/10 text-rose-600 border-rose-500/20";
  if (status === "draft") return "bg-slate-500/10 text-slate-600 border-slate-500/20";
  if (status === "needs_parts" || status === "needs_followup") return "bg-amber-500/10 text-amber-600 border-amber-500/20";
  return "bg-[var(--gbp-accent)]/10 text-[var(--gbp-accent)] border-[var(--gbp-accent)]/20";
}

function priorityClassName(priority: string) {
  if (priority === "urgent") return "bg-rose-500/12 text-rose-700 border border-rose-500/20";
  if (priority === "high") return "bg-amber-500/14 text-amber-700 border border-amber-500/20";
  if (priority === "medium") return "bg-sky-500/12 text-sky-700 border border-sky-500/20";
  if (priority === "low") return "bg-emerald-500/12 text-emerald-700 border border-emerald-500/20";
  return "bg-[var(--gbp-bg)] text-[var(--gbp-text2)] border border-[var(--gbp-border)]";
}

function latestRequestResponse(request: MaintenanceRequest): MaintenanceUpdate | null {
  const relevantUpdates = request.updates.filter((update) => {
    if (update.updateType === "created" || update.updateType === "submitted") return false;
    if (update.fromStatus === "draft" && update.toStatus === "draft") return false;
    return true;
  });

  return relevantUpdates.at(-1) ?? null;
}

function MaintenanceRequestCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="h-3 w-40 rounded bg-[var(--gbp-border)]" />
          <div className="h-5 w-56 rounded bg-[var(--gbp-border)]" />
        </div>
        <div className="h-6 w-24 rounded-full bg-[var(--gbp-border)]" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <div className="h-7 w-24 rounded-full bg-[var(--gbp-bg)]" />
        <div className="h-7 w-28 rounded-full bg-[var(--gbp-bg)]" />
        <div className="h-7 w-24 rounded-full bg-[var(--gbp-bg)]" />
      </div>
      <div className="mt-4 space-y-2">
        <div className="h-3 w-full rounded bg-[var(--gbp-border)]" />
        <div className="h-3 w-4/5 rounded bg-[var(--gbp-border)]" />
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div className="h-7 w-24 rounded-full bg-[var(--gbp-bg)]" />
        <div className="h-7 w-28 rounded-full bg-[var(--gbp-bg)]" />
        <div className="ml-auto h-7 w-28 rounded-full bg-[var(--gbp-border)]" />
      </div>
    </div>
  );
}

function MaintenanceRequestDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-[var(--gbp-border)]" />
        <div className="h-7 w-40 rounded bg-[var(--gbp-border)]" />
      </div>
      <div className="rounded-xl bg-[var(--gbp-bg)] p-4">
        <div className="h-3 w-28 rounded bg-[var(--gbp-border)]" />
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full rounded bg-[var(--gbp-border)]" />
          <div className="h-3 w-5/6 rounded bg-[var(--gbp-border)]" />
          <div className="h-3 w-4/6 rounded bg-[var(--gbp-border)]" />
        </div>
      </div>
      <div className="space-y-3">
        <div className="h-3 w-20 rounded bg-[var(--gbp-border)]" />
        <div className="space-y-3">
          <div className="h-16 rounded-xl bg-[var(--gbp-bg)]" />
          <div className="h-16 rounded-xl bg-[var(--gbp-bg)]" />
          <div className="h-16 rounded-xl bg-[var(--gbp-bg)]" />
        </div>
      </div>
    </div>
  );
}

export function MaintenanceWorkspace({
  mode,
  apiBase,
  canCreate,
  canRespond,
  initialRequests,
  currentUserId,
  initialCatalog,
  branches,
}: MaintenanceWorkspaceProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [catalog, setCatalog] = useState(initialCatalog);
  const [activeStatus, setActiveStatus] = useState("open");
  const [selectedId, setSelectedId] = useState(initialRequests[0]?.id ?? "");
  const [expandedRequestIds, setExpandedRequestIds] = useState<Set<string>>(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [catalogManagerOpen, setCatalogManagerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [responding, setResponding] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [createForm, setCreateForm] = useState<MaintenanceRequestFormState>(() => deriveFormState(branches));
  const [draftForm, setDraftForm] = useState<MaintenanceRequestFormState>(() => deriveFormState(branches));
  const [responseStatus, setResponseStatus] = useState<"schedule_visit" | MaintenanceStatus>(() => defaultResponseStatus(initialRequests[0] ?? null));
  const [responseScheduledVisitAt, setResponseScheduledVisitAt] = useState("");

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? requests[0] ?? null,
    [requests, selectedId],
  );

  useEffect(() => {
    if (!selectedRequest && requests[0]) {
      setSelectedId(requests[0].id);
    }
  }, [requests, selectedRequest]);

  async function refresh(status = activeStatus, options?: { showSkeleton?: boolean }) {
    if (options?.showSkeleton) {
      setIsRefreshingList(true);
    }
    try {
      const response = await fetch(`${apiBase}?status=${encodeURIComponent(status)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "No se pudo cargar mantenimiento");
      }
      setRequests(payload.requests ?? []);
      if (payload.catalog) setCatalog(payload.catalog as MaintenanceCatalog);
      if (payload.requests?.[0]?.id) {
        setSelectedId(payload.requests[0].id);
      } else {
        setSelectedId("");
      }
    } finally {
      if (options?.showSkeleton) {
        setIsRefreshingList(false);
      }
    }
  }

  function changeStatus(status: string) {
    setActiveStatus(status);
    startTransition(() => {
      refresh(status, { showSkeleton: true }).catch((error) => toast.error(error.message));
    });
  }

  function toggleRequestExpansion(requestId: string) {
    setExpandedRequestIds((prev) => {
      const next = new Set(prev);
      if (next.has(requestId)) {
        next.delete(requestId);
      } else {
        next.add(requestId);
      }
      return next;
    });
  }

  function findCategoryByName(value: string) {
    return catalog.categories.find((category) => normalizeLabel(category.name) === normalizeLabel(value));
  }

  function findServiceItemByName(categoryId: string | null, value: string) {
    if (!categoryId) return null;
    return catalog.serviceItems.find((item) => item.categoryId === categoryId && normalizeLabel(item.name) === normalizeLabel(value));
  }

  function getServiceItemOptions(categoryName: string) {
    const category = findCategoryByName(categoryName);
    if (!category) return [];
    return catalog.serviceItems
      .filter((item) => item.categoryId === category.id)
      .map((item) => item.name);
  }

  function getIssueOptions(categoryName: string, serviceItemName: string) {
    const category = findCategoryByName(categoryName);
    const serviceItem = findServiceItemByName(category?.id ?? null, serviceItemName);
    if (!serviceItem) return [];
    return catalog.issues
      .filter((issue) => issue.serviceItemId === serviceItem.id)
      .map((issue) => issue.name);
  }

  async function submitCreate(formData: FormData) {
    const response = await fetch(apiBase, {
      method: "POST",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo crear la request");
    setCreateOpen(false);
    setCatalogManagerOpen(false);
    setCreateForm(deriveFormState(catalog.branches));
    toast.success("Request guardada");
    await refresh(activeStatus);
  }

  async function submitResponse(formData: FormData) {
    if (!selectedRequest) return;
    setResponding(true);
    try {
      const rawStatus = formData.get("status");
      const normalizedStatus = rawStatus === "schedule_visit" ? "visit_scheduled" : rawStatus;
      const scheduledVisitAt = rawStatus === "schedule_visit" ? formData.get("scheduled_visit_at") : null;
      const response = await fetch(`${apiBase}/${selectedRequest.id}/updates`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: normalizedStatus,
          scheduled_visit_at: scheduledVisitAt,
          message: formData.get("message"),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo responder la request");

      const files = formData.getAll("files").filter((value): value is File => value instanceof File && value.size > 0);
      if (files.length) {
        const attachmentData = new FormData();
        for (const file of files) attachmentData.append("files", file);
        const attachmentsResponse = await fetch(`${apiBase}/${selectedRequest.id}/attachments`, {
          method: "POST",
          body: attachmentData,
        });
        const attachmentsPayload = await attachmentsResponse.json();
        if (!attachmentsResponse.ok) throw new Error(attachmentsPayload.error ?? "No se pudieron adjuntar archivos");
      }

      toast.success("Respuesta guardada");
      await refresh(activeStatus);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al responder");
    } finally {
      setResponding(false);
    }
  }

  async function submitDraftUpdate(formData: FormData) {
    if (!selectedRequest) return;
    const response = await fetch(`${apiBase}/${selectedRequest.id}`, {
      method: "PUT",
      body: formData,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "No se pudo actualizar el borrador");
    toast.success(formData.get("action") === "submit" ? "Borrador enviado" : "Borrador actualizado");
    await refresh(activeStatus);
  }

  useEffect(() => {
    if (!createOpen) return;
    setCreateForm(deriveFormState(catalog.branches));
  }, [catalog.branches, createOpen]);

  useEffect(() => {
    if (!selectedRequest || selectedRequest.status !== "draft") return;
    setDraftForm(deriveFormState(catalog.branches, selectedRequest));
  }, [catalog.branches, selectedRequest]);

  useEffect(() => {
    setResponseStatus(defaultResponseStatus(selectedRequest));
    setResponseScheduledVisitAt("");
  }, [selectedRequest]);

  const categoryOptions = useMemo(
    () => catalog.categories.map((category) => category.name),
    [catalog.categories],
  );

  const showListSkeleton = isRefreshingList;
  const showEmptyState = !showListSkeleton && requests.length === 0;

  return (
    <div className="space-y-5">
      <section className="rounded-[1.5rem] border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-6 py-5 shadow-sm sm:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="gbp-page-eyebrow mb-2 text-[var(--gbp-muted)]">{mode === "company" ? "Panel empresa" : "Portal empleado"}</p>
            <h1 className="text-2xl font-black tracking-tight text-[var(--gbp-text)]">Mantenimiento</h1>
            <p className="mt-1 text-sm text-[var(--gbp-text2)]">Requests por locacion con historial, visitas y adjuntos.</p>
          </div>
          {canCreate ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-text)] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva request
            </button>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => changeStatus(tab.value)}
            disabled={showListSkeleton}
            className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.08em] transition ${
              activeStatus === tab.value
                ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white"
                : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
            } ${showListSkeleton ? "cursor-wait opacity-75" : ""}`}
          >
            {tab.label}
          </button>
        ))}
        {showListSkeleton ? <Loader2 className="h-4 w-4 animate-spin text-[var(--gbp-muted)]" /> : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section className="space-y-3">
          {showEmptyState ? (
            <div className="rounded-2xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-10 text-center">
              <Wrench className="mx-auto h-8 w-8 text-[var(--gbp-muted)]" />
              <p className="mt-3 text-sm font-bold text-[var(--gbp-text)]">No hay requests en esta vista</p>
              <p className="mt-1 text-xs text-[var(--gbp-text2)]">Cambia el filtro o crea una nueva request de mantenimiento.</p>
            </div>
          ) : null}

          {showListSkeleton ? (
            <>
              <MaintenanceRequestCardSkeleton />
              <MaintenanceRequestCardSkeleton />
              <MaintenanceRequestCardSkeleton />
            </>
          ) : null}

          {!showListSkeleton ? requests.map((request) => {
            const active = selectedRequest?.id === request.id;
            const expanded = expandedRequestIds.has(request.id);
            const latestResponse = latestRequestResponse(request);
            return (
              <article
                key={request.id}
                className={`rounded-2xl border bg-[var(--gbp-surface)] shadow-sm transition hover:shadow-md ${
                  active ? "border-[var(--gbp-accent)]/70 ring-1 ring-[var(--gbp-accent)]/10" : "border-[var(--gbp-border)]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(request.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[var(--gbp-muted)]">
                        <CalendarDays className="h-4 w-4" />
                        <span>Creada {dateLabel(request.createdAt)}</span>
                        {request.resolvedAt ? <span>Resuelta {dateLabel(request.resolvedAt)}</span> : null}
                      </div>
                      <h2 className="truncate text-base font-black text-[var(--gbp-text)]">{request.title}</h2>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${priorityClassName(request.priority)}`}>
                        Prioridad {PRIORITY_LABELS[request.priority] ?? request.priority}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClassName(request.status)}`}>
                        {request.status === "visit_scheduled" && request.scheduledVisitAt
                          ? `Visita programada - ${visitDateLabel(request.scheduledVisitAt)}`
                          : STATUS_LABELS[request.status]}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--gbp-text2)]">
                    <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 font-semibold">Locacion: {request.branchName}</span>
                    <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 font-semibold">Categoria: {request.category}</span>
                    {request.serviceItem ? <span className="rounded-full bg-[var(--gbp-bg)] px-3 py-1 font-semibold">Item: {request.serviceItem}</span> : null}
                  </div>

                  <p className="mt-3 line-clamp-1 text-sm leading-relaxed text-[var(--gbp-text2)]">{request.description}</p>
                </button>

                <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
                  {request.attachments.length ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gbp-bg)] px-3 py-1 text-xs font-semibold text-[var(--gbp-text2)]">
                      <Paperclip className="h-3.5 w-3.5" />
                      {request.attachments.length} adjuntos
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(request.id);
                      toggleRequestExpansion(request.id);
                    }}
                    className="ml-auto inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-1 text-xs font-bold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-surface2)]"
                    aria-expanded={expanded}
                  >
                    {expanded ? "Ocultar respuesta" : latestResponse ? "Ver respuesta" : "No hay respuesta"}
                    <ChevronDown className={`h-3.5 w-3.5 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                </div>

                {expanded ? (
                  <div className="border-t border-[var(--gbp-border)] px-4 py-4">
                    {latestResponse ? (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4">
                          <p className="text-base leading-relaxed text-[var(--gbp-text)]">
                            <span className="mr-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Ultima respuesta:</span>
                            <span className="whitespace-pre-wrap">{latestResponse.message?.trim() || "Sin comentario en esta respuesta."}</span>
                          </p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Respondio</p>
                            <p className="mt-1 text-sm text-[var(--gbp-text2)]">{latestResponse.actorName}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Estado</p>
                            <p className="mt-1 text-sm text-[var(--gbp-text2)]">{latestResponse.toStatus ? STATUS_LABELS[latestResponse.toStatus] : "Comentario"}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Fecha</p>
                            <p className="mt-1 text-sm text-[var(--gbp-text2)]">{dateLabel(latestResponse.createdAt)}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Visita programada</p>
                            <p className="mt-1 text-sm text-[var(--gbp-text2)]">{latestResponse.scheduledVisitAt ? visitDateLabel(latestResponse.scheduledVisitAt) : "Sin fecha programada"}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-xl bg-[var(--gbp-bg)] px-4 py-3 text-sm text-[var(--gbp-muted)]">
                        No hay respuesta todavia para esta request.
                      </div>
                    )}

                  </div>
                ) : null}
              </article>
            );
          }) : null}
        </section>

        <aside className="sticky top-4 h-fit rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-sm">
          {showListSkeleton ? <MaintenanceRequestDetailSkeleton /> : null}
          {!showListSkeleton && selectedRequest ? (
            <div className="space-y-5">
              {/** Drafts stay editable until they are submitted; after that, everything moves through responses. */}
              {(() => {
                const canEditDraft = selectedRequest.status === "draft" && canCreate && (
                  mode === "company" || selectedRequest.createdBy === currentUserId
                );

                if (!canEditDraft) return null;

                return (
                  <form
                    action={(formData) => {
                      formData.set("branch_id", draftForm.branchId);
                      formData.set("priority", draftForm.priority);
                      formData.set("category", draftForm.category);
                      formData.set("service_item", draftForm.serviceItem);
                      formData.set("issue", draftForm.issue);
                      formData.set("title", draftForm.title);
                      formData.set("description", draftForm.description);
                      startTransition(() => {
                        submitDraftUpdate(formData).catch((error) => toast.error(error.message));
                      });
                    }}
                    className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-[var(--gbp-text)]">Editar borrador</p>
                      {mode === "company" ? (
                        <button
                          type="button"
                          onClick={() => setCatalogManagerOpen((prev) => !prev)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-[11px] font-bold text-[var(--gbp-text2)]"
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                          {catalogManagerOpen ? "Cerrar catalogo" : "Gestionar catalogo"}
                        </button>
                      ) : null}
                    </div>
                    <select value={draftForm.branchId} onChange={(event) => setDraftForm((prev) => ({ ...prev, branchId: event.target.value }))} required className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm">
                      {catalog.branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>{branch.name}</option>
                      ))}
                    </select>
                    <select value={draftForm.priority} onChange={(event) => setDraftForm((prev) => ({ ...prev, priority: event.target.value }))} className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm">
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                    <SearchableCreatableField
                      label="Categoria"
                      name="category"
                      value={draftForm.category}
                      onChange={(value) => setDraftForm((prev) => ({ ...prev, category: value, serviceItem: "", issue: "" }))}
                      options={categoryOptions}
                      placeholder="Busca o crea una categoria"
                      required
                    />
                    <SearchableCreatableField
                      label="Item de servicio"
                      name="service_item"
                      value={draftForm.serviceItem}
                      onChange={(value) => setDraftForm((prev) => ({ ...prev, serviceItem: value, issue: "" }))}
                      options={getServiceItemOptions(draftForm.category)}
                      placeholder="Busca o crea un item"
                      disabled={!draftForm.category.trim()}
                    />
                    <SearchableCreatableField
                      label="Issue"
                      name="issue"
                      value={draftForm.issue}
                      onChange={(value) => setDraftForm((prev) => ({ ...prev, issue: value }))}
                      options={getIssueOptions(draftForm.category, draftForm.serviceItem)}
                      placeholder={draftForm.serviceItem.trim() ? "Busca o crea un issue" : "Primero elegi un item"}
                      disabled={!draftForm.serviceItem.trim()}
                    />
                    <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                      Titulo
                      <input value={draftForm.title} onChange={(event) => setDraftForm((prev) => ({ ...prev, title: event.target.value }))} required placeholder="Titulo" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                    </label>
                    <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                      Detalles
                      <textarea value={draftForm.description} onChange={(event) => setDraftForm((prev) => ({ ...prev, description: event.target.value }))} required rows={4} placeholder="Detalles" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                    </label>
                    <input name="files" type="file" multiple className="w-full rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs" />
                    {mode === "company" && catalogManagerOpen ? (
                      <MaintenanceCatalogManager catalog={catalog} onCatalogChange={setCatalog} />
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button type="submit" name="action" value="draft" disabled={isPending} className="rounded-xl border border-[var(--gbp-border)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text2)] disabled:opacity-60">
                        Guardar cambios
                      </button>
                      <button type="submit" name="action" value="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        Guardar y enviar
                      </button>
                    </div>
                  </form>
                );
              })()}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">{selectedRequest.branchName}</p>
                  <h2 className="mt-1 text-xl font-bold text-[var(--gbp-text)]">{selectedRequest.title}</h2>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${statusClassName(selectedRequest.status)}`}>
                  {STATUS_LABELS[selectedRequest.status]}
                </span>
              </div>

              <div className="rounded-xl bg-[var(--gbp-bg)] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Detalle original</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--gbp-text2)]">{selectedRequest.description}</p>
              </div>

              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">
                  <Paperclip className="h-4 w-4" />
                  Adjuntos
                </p>
                {selectedRequest.attachments.length ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedRequest.attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.signedUrl ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-2 text-xs font-semibold text-[var(--gbp-text2)]"
                      >
                        {attachment.mimeType?.startsWith("image/") && attachment.signedUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={attachment.signedUrl} alt={attachment.fileName} className="mb-2 h-24 w-full rounded-lg object-cover" />
                        ) : (
                          <FileText className="mb-2 h-6 w-6 text-[var(--gbp-muted)]" />
                        )}
                        <span className="line-clamp-1">{attachment.fileName}</span>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-[var(--gbp-bg)] px-3 py-2 text-xs text-[var(--gbp-muted)]">Sin adjuntos.</p>
                )}
              </div>

              <div>
                <p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">
                  <MessageSquare className="h-4 w-4" />
                  Timeline
                </p>
                <div className="space-y-3">
                  {selectedRequest.updates.map((update) => (
                    <div key={update.id} className="border-l-2 border-[var(--gbp-border)] pl-3">
                      <p className="text-xs font-bold text-[var(--gbp-text)]">
                        {update.toStatus ? STATUS_LABELS[update.toStatus] : "Comentario"}
                      </p>
                      <p className="text-[11px] text-[var(--gbp-muted)]">
                        {update.actorName} - {dateLabel(update.createdAt)}
                      </p>
                      {update.scheduledVisitAt ? <p className="mt-1 text-xs text-[var(--gbp-text2)]">Visita: {visitDateLabel(update.scheduledVisitAt)}</p> : null}
                      {update.message ? <p className="mt-1 text-sm text-[var(--gbp-text2)]">{update.message}</p> : null}
                    </div>
                  ))}
                </div>
              </div>

              {canRespond && selectedRequest.status !== "draft" ? (
                <form
                  action={(formData) => {
                    submitResponse(formData);
                  }}
                  className="space-y-3 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-4"
                >
                  <p className="text-sm font-bold text-[var(--gbp-text)]">Responder request</p>
                  <select
                    name="status"
                    value={responseStatus}
                    onChange={(event) => {
                      const nextStatus = event.target.value as "schedule_visit" | MaintenanceStatus;
                      setResponseStatus(nextStatus);
                      if (nextStatus !== "schedule_visit") {
                        setResponseScheduledVisitAt("");
                      }
                    }}
                    className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm"
                  >
                    {RESPOND_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                  {responseStatus === "schedule_visit" ? (
                    <input
                      name="scheduled_visit_at"
                      type="date"
                      value={responseScheduledVisitAt}
                      onChange={(event) => setResponseScheduledVisitAt(event.target.value)}
                      required
                      className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm"
                    />
                  ) : null}
                  <textarea name="message" rows={3} placeholder="Reporte, notas o requerimientos..." className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-sm" />
                  <input name="files" type="file" multiple className="w-full rounded-xl border border-dashed border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-xs" />
                  <button disabled={responding} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                    {responding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Guardar respuesta
                  </button>
                </form>
              ) : null}
            </div>
          ) : !showListSkeleton ? (
            <p className="text-sm text-[var(--gbp-muted)]">Selecciona una request para ver el detalle.</p>
          ) : null}
        </aside>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/40 p-4">
          <form
            action={(formData) => {
              formData.set("branch_id", createForm.branchId);
              formData.set("priority", createForm.priority);
              formData.set("category", createForm.category);
              formData.set("service_item", createForm.serviceItem);
              formData.set("issue", createForm.issue);
              formData.set("title", createForm.title);
              formData.set("description", createForm.description);
              startTransition(() => {
                submitCreate(formData).catch((error) => toast.error(error.message));
              });
            }}
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-5 shadow-2xl"
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--gbp-muted)]">Nueva request</p>
                <h2 className="text-xl font-bold text-[var(--gbp-text)]">Crear mantenimiento</h2>
              </div>
              <div className="flex items-center gap-2">
                {mode === "company" ? (
                  <button
                    type="button"
                    onClick={() => setCatalogManagerOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-3 py-2 text-[11px] font-bold text-[var(--gbp-text2)]"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    {catalogManagerOpen ? "Cerrar catalogo" : "Gestionar catalogo"}
                  </button>
                ) : null}
                <button type="button" onClick={() => setCreateOpen(false)} className="rounded-full bg-[var(--gbp-bg)] p-2 text-[var(--gbp-text2)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                Locacion
                <select value={createForm.branchId} onChange={(event) => setCreateForm((prev) => ({ ...prev, branchId: event.target.value }))} required className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm">
                  {catalog.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)]">
                Prioridad
                <select value={createForm.priority} onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value }))} className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm">
                  <option value="low">Baja</option>
                  <option value="medium">Media</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </label>
              <SearchableCreatableField
                label="Categoria"
                name="category"
                value={createForm.category}
                onChange={(value) => setCreateForm((prev) => ({ ...prev, category: value, serviceItem: "", issue: "" }))}
                options={categoryOptions}
                placeholder="Busca o crea una categoria"
                required
              />
              <SearchableCreatableField
                label="Item de servicio"
                name="service_item"
                value={createForm.serviceItem}
                onChange={(value) => setCreateForm((prev) => ({ ...prev, serviceItem: value, issue: "" }))}
                options={getServiceItemOptions(createForm.category)}
                placeholder="Busca o crea un item"
                disabled={!createForm.category.trim()}
              />
              <div className="sm:col-span-2">
                <SearchableCreatableField
                  label="Issue"
                  name="issue"
                  value={createForm.issue}
                  onChange={(value) => setCreateForm((prev) => ({ ...prev, issue: value }))}
                  options={getIssueOptions(createForm.category, createForm.serviceItem)}
                  placeholder={createForm.serviceItem.trim() ? "Busca o crea un issue" : "Primero elegi un item"}
                  disabled={!createForm.serviceItem.trim()}
                />
              </div>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)] sm:col-span-2">
                Titulo
                <input value={createForm.title} onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))} required placeholder="Ej: Sink leaks" className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-sm font-semibold text-[var(--gbp-text)] sm:col-span-2">
                Detalles
                <textarea value={createForm.description} onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))} required rows={5} placeholder="Conta que pasa, donde ocurre y cualquier dato util." className="w-full rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-3 py-2 text-sm" />
              </label>
              <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--gbp-accent)] bg-[var(--gbp-accent)]/5 px-4 py-8 text-center text-sm font-semibold text-[var(--gbp-text2)] sm:col-span-2">
                <ImageIcon className="h-7 w-7 text-[var(--gbp-accent)]" />
                Drop o upload de imagenes/archivos
                <input name="files" type="file" multiple className="max-w-full text-xs" />
              </label>
              {mode === "company" && catalogManagerOpen ? (
                <div className="sm:col-span-2">
                  <MaintenanceCatalogManager catalog={catalog} onCatalogChange={setCatalog} />
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="submit" name="action" value="draft" disabled={isPending} className="rounded-xl border border-[var(--gbp-border)] px-4 py-2.5 text-sm font-bold text-[var(--gbp-text2)] disabled:opacity-60">
                Guardar borrador
              </button>
              <button type="submit" name="action" value="submit" disabled={isPending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--gbp-accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Crear y enviar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
