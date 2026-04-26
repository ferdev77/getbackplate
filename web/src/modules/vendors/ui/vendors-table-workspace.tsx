"use client";

import { useState, useCallback, useTransition, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Truck, Plus, Search, Pencil, Trash2, X, Phone, Mail, Globe, MapPin, FileText, Building2, Clock, Eye, MessageCircle } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { SlideUp } from "@/shared/ui/animations";
import { ScopePillsOverflow } from "@/shared/ui/scope-pills-overflow";
import { OperationHeaderCard } from "@/shared/ui/operation-header-card";
import { createSupabaseBrowserClient } from "@/infrastructure/supabase/client/browser";
import type { VendorCategoryOption, VendorRow } from "@/modules/vendors/types";
import { DEFAULT_VENDOR_CATEGORIES } from "@/modules/vendors/types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Branch = { id: string; name: string };

type Props = {
  initialVendors: VendorRow[];
  branches: Branch[];
  initialCategories: VendorCategoryOption[];
  organizationId: string;
  canCreate?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  apiBasePath?: string;
  historyEndpointBase?: string | null;
  deferredDataUrl?: string;
};

type HistoryEntry = {
  id: string;
  action: string;
  outcome: string;
  severity: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actorName: string;
};

// ─── Design tokens (consistent with rest of platform) ─────────────────────────
const TEXT_STRONG = "text-[var(--gbp-text)]";
const TEXT_MUTED = "text-[var(--gbp-text2)]";
const CARD = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]";
const ACTION_BTN = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] transition-colors";
const ACTION_BTN_DANGER = "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] transition-colors";

// ─── Category config ───────────────────────────────────────────────────────────
const CATEGORY_CLASS: Record<string, string> = {
  alimentos:     "border-amber-200 bg-amber-50 text-amber-700",
  bebidas:       "border-blue-200 bg-blue-50 text-blue-700",
  equipos:       "border-purple-200 bg-purple-50 text-purple-700",
  limpieza:      "border-emerald-200 bg-emerald-50 text-emerald-700",
  mantenimiento: "border-rose-200 bg-rose-50 text-rose-700",
  empaque:       "border-sky-200 bg-sky-50 text-sky-700",
  otro:          "border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]",
};

function CategoryBadge({ category, label }: { category: string; label?: string }) {
  const cls = CATEGORY_CLASS[category] ?? CATEGORY_CLASS.otro;
  const resolvedLabel = label ?? DEFAULT_VENDOR_CATEGORIES.find((c) => c.value === category)?.label ?? category;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {resolvedLabel}
    </span>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[var(--gbp-muted)]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-500" : "bg-[var(--gbp-muted)]"}`} />
      {active ? "Activo" : "Inactivo"}
    </span>
  );
}

// ─── Action labels for history ─────────────────────────────────────────────────
const ACTION_LABELS: Record<string, { verb: string; color: string }> = {
  "vendor.create":     { verb: "creó el proveedor", color: "#10b981" },
  "vendor.update":     { verb: "actualizó información", color: "#3b82f6" },
  "vendor.deactivate": { verb: "desactivó el proveedor", color: "#f59e0b" },
  "vendor.delete":     { verb: "eliminó el proveedor", color: "#ef4444" },
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  category: "Categoría",
  contact_name: "Contacto",
  contact_email: "Email",
  contact_phone: "Teléfono",
  contact_whatsapp: "WhatsApp",
  website_url: "Sitio Web",
  address: "Dirección",
  notes: "Notas",
  is_active: "Estado",
  branch_ids: "Locaciones"
};

type FieldChange = { old?: unknown; new?: unknown };

function formatUnknown(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getChangesSummary(metadata: Record<string, unknown> | null): string[] | null {
  if (!metadata) return null;
  const changesList: string[] = [];

  const changes = metadata.changes;
  if (changes && typeof changes === "object") {
    for (const [key, value] of Object.entries(changes)) {
      const label = FIELD_LABELS[key] || key;

      // Manejar el formato nuevo { old: x, new: y }
      if (value && typeof value === "object" && "old" in value && "new" in value) {
        const payload = value as FieldChange;
        const oldVal = formatUnknown(payload.old, "nada");
        const newVal = formatUnknown(payload.new, "vacio");

        // Manejo especial para categorías
        if (key === "category") {
           const oldCat = DEFAULT_VENDOR_CATEGORIES.find(c => c.value === payload.old)?.label ?? oldVal;
           const newCat = DEFAULT_VENDOR_CATEGORIES.find(c => c.value === payload.new)?.label ?? newVal;
           changesList.push(`${label}: de "${oldCat}" a "${newCat}"`);
        } else if (key === "is_active") {
           const newStatus = payload.new ? "Activo" : "Inactivo";
           changesList.push(`Estado cambiado a ${newStatus}`);
        } else {
           changesList.push(`${label}: de "${oldVal}" a "${newVal}"`);
        }
      } else {
        // Formato viejo donde solo era el valor { name: "Nuevo" }
        changesList.push(`Editó ${label}`);
      }
    }
  }
  
  if (metadata.branch_ids) {
    changesList.push("Actualizó las locaciones asignadas");
  }
  
  if (changesList.length > 0) return changesList;
  
  // For creations or deletions where we have name and category
  if (typeof metadata.name === "string" && metadata.name.trim()) {
    return [`Proveedor: ${metadata.name}`];
  }
  
  return null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-US", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function VendorHistoryTab({ vendorId, historyEndpointBase }: { vendorId: string; historyEndpointBase: string }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    fetch(`${historyEndpointBase}/${vendorId}/history`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          const message = typeof data?.error === "string" ? data.error : "No se pudo cargar el historial";
          throw new Error(message);
        }
        return data;
      })
      .then((d) => {
        if (cancelled) return;
        setHistory(Array.isArray(d.history) ? d.history : []);
      })
      .catch(() => {
        if (cancelled) return;
        setError("No se pudo cargar el historial");
        setHistory([]);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [historyEndpointBase, vendorId]);

  const loading = !history && !error;

  if (loading) return <div className={`py-10 text-center text-xs ${TEXT_MUTED}`}>Cargando historial...</div>;
  if (error) return <div className="py-6 px-5 text-xs text-[var(--gbp-error)]">{error}</div>;
  if (!history || history.length === 0) {
    return (
      <div className="py-10 flex flex-col items-center gap-2">
        <Clock className="h-7 w-7 text-[var(--gbp-muted)]" />
        <p className={`text-xs ${TEXT_MUTED}`}>Sin historial registrado</p>
      </div>
    );
  }

  return (
    <div className="p-5 flex flex-col gap-6">
      {history.map((entry) => {
        const info = ACTION_LABELS[entry.action] ?? { verb: "realizó una acción", color: "var(--gbp-accent)" };
        const summary = getChangesSummary(entry.metadata);

        return (
          <div key={entry.id} className="relative pl-4">
            <div className="absolute left-0 top-1.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-start gap-2">
                <span className={`text-sm ${TEXT_STRONG}`}>
                  <strong className="font-semibold">{entry.actorName}</strong> <span className={`text-xs ${TEXT_MUTED}`}>{info.verb}</span>
                </span>
                <span className={`text-[11px] font-medium whitespace-nowrap pt-0.5 ${TEXT_MUTED}`}>{formatDate(entry.createdAt)}</span>
              </div>
              {summary && summary.length > 0 && (
                <div className="flex flex-col gap-1 mt-1.5">
                  {summary.map((changeLine, idx) => (
                    <div key={idx} className={`text-xs inline-flex w-fit bg-[var(--gbp-surface2)] px-2 py-1 rounded-md border border-[var(--gbp-border)] ${TEXT_MUTED}`}>
                      {changeLine}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Detail Slide-in Panel ────────────────────────────────────────────────────
function VendorDetailPanel({ vendor, categoryLabel, onClose, onEdit, onDelete, canEdit, canDelete, historyEndpointBase }: {
  vendor: VendorRow;
  categoryLabel?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  historyEndpointBase: string | null;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const tabs = [{ id: "details" as const, label: "Detalles" }, ...(historyEndpointBase ? [{ id: "history" as const, label: "Historial" }] : [])];

  return (
    <div className="fixed inset-0 z-[900] flex justify-end">
      <div className="absolute inset-0 bg-black/25" onClick={onClose} />
      <div className="relative w-[min(420px,100vw)] h-full bg-[var(--gbp-surface)] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[var(--gbp-border)] sticky top-0 bg-[var(--gbp-surface)] z-10">
          <div className="flex justify-between items-start mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <StatusBadge active={vendor.isActive} />
                <CategoryBadge category={vendor.category} label={categoryLabel} />
              </div>
              <h2 className={`text-lg font-bold truncate ${TEXT_STRONG}`}>{vendor.name}</h2>
            </div>
            <button onClick={onClose} className={`ml-2 flex-shrink-0 ${ACTION_BTN}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* Tabs */}
          <div className="flex gap-0 -mb-px">
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${activeTab === tab.id
                  ? "border-[var(--gbp-accent)] text-[var(--gbp-accent)]"
                  : `border-transparent ${TEXT_MUTED} hover:${TEXT_STRONG}`}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "details" ? (
            <div className="p-5 flex flex-col gap-4">
              {vendor.contactName && (
                <div className="pb-4 border-b border-[var(--gbp-border)]">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${TEXT_MUTED}`}>Contacto</p>
                  <p className={`text-sm font-medium ${TEXT_STRONG}`}>{vendor.contactName}</p>
                </div>
              )}
              {vendor.contactPhone && (
                <div className="pb-4 border-b border-[var(--gbp-border)]">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${TEXT_MUTED}`}>Teléfono</p>
                  <a href={`tel:${vendor.contactPhone}`} className="flex items-center gap-1.5 text-sm font-medium text-[var(--gbp-accent)] hover:underline">
                    <Phone className="h-3.5 w-3.5" />{vendor.contactPhone}
                  </a>
                </div>
              )}
              {vendor.contactWhatsapp && (
                <div className="pb-4 border-b border-[var(--gbp-border)]">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${TEXT_MUTED}`}>WhatsApp</p>
                  <a href={`https://wa.me/${vendor.contactWhatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-[var(--gbp-accent)] hover:underline">
                    <MessageCircle className="h-3.5 w-3.5" />{vendor.contactWhatsapp}
                  </a>
                </div>
              )}
              {vendor.contactEmail && (
                <div className="pb-4 border-b border-[var(--gbp-border)]">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${TEXT_MUTED}`}>Email</p>
                  <a href={`mailto:${vendor.contactEmail}`} className="flex items-center gap-1.5 text-sm font-medium text-[var(--gbp-accent)] hover:underline">
                    <Mail className="h-3.5 w-3.5" />{vendor.contactEmail}
                  </a>
                </div>
              )}
              {vendor.websiteUrl && (
                <div className="pb-4 border-b border-[var(--gbp-border)]">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${TEXT_MUTED}`}>Sitio web</p>
                  <a href={vendor.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-[var(--gbp-accent)] hover:underline">
                    <Globe className="h-3.5 w-3.5" />{vendor.websiteUrl}
                  </a>
                </div>
              )}
              {vendor.address && (
                <div className="pb-4 border-b border-[var(--gbp-border)]">
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1 ${TEXT_MUTED}`}>Dirección</p>
                  <p className={`flex items-start gap-1.5 text-sm font-medium ${TEXT_STRONG}`}>
                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-[var(--gbp-muted)]" />{vendor.address}
                  </p>
                </div>
              )}
              <div className="pb-4 border-b border-[var(--gbp-border)]">
                <p className={`text-[11px] font-bold uppercase tracking-widest mb-2 ${TEXT_MUTED}`}>Locaciones asignadas</p>
                {vendor.branchNames.length === 0 ? (
                  <span className={`text-xs italic ${TEXT_MUTED}`}>Todas las locaciones</span>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {vendor.branchNames.map((name) => (
                      <span key={name} className="inline-flex items-center gap-1 rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--gbp-text2)]">
                        <Building2 className="h-3 w-3" />{name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {vendor.notes && (
                <div>
                  <p className={`text-[11px] font-bold uppercase tracking-widest mb-1.5 ${TEXT_MUTED}`}>Notas</p>
                  <p className={`text-xs leading-relaxed p-3 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] whitespace-pre-wrap ${TEXT_MUTED}`}>
                    <FileText className="h-3 w-3 inline-block mr-1 opacity-60" />{vendor.notes}
                  </p>
                </div>
              )}
            </div>
          ) : (
            historyEndpointBase ? <VendorHistoryTab key={vendor.id} vendorId={vendor.id} historyEndpointBase={historyEndpointBase} /> : null
          )}
        </div>

        {/* Footer actions */}
        {canEdit || canDelete ? (
          <div className="p-4 border-t border-[var(--gbp-border)] flex gap-2 sticky bottom-0 bg-[var(--gbp-surface)]">
            {canEdit ? (
              <button onClick={onEdit}
                className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[var(--gbp-accent)] text-[var(--gbp-accent)] text-xs font-bold hover:bg-[var(--gbp-accent)] hover:text-white transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Editar
              </button>
            ) : null}
            {canDelete ? (
              <button onClick={onDelete}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] text-xs font-bold hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_12%,transparent)] transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Delete Confirm Dialog ─────────────────────────────────────────────────────
function DeleteConfirmDialog({ vendor, onCancel, onConfirm, isPending }: {
  vendor: VendorRow;
  onCancel: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`rounded-2xl border p-6 w-[min(400px,95vw)] shadow-2xl ${CARD}`}>
        <div className="text-3xl mb-3">⚠️</div>
        <h3 className={`text-base font-bold mb-2 ${TEXT_STRONG}`}>Eliminar proveedor</h3>
        <p className={`text-sm mb-5 leading-relaxed ${TEXT_MUTED}`}>
          ¿Estás seguro de que querés eliminar <strong className={TEXT_STRONG}>{vendor.name}</strong>?
          Esta acción no se puede deshacer.
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className={`h-9 px-4 rounded-lg border border-[var(--gbp-border)] text-xs font-semibold hover:bg-[var(--gbp-surface2)] transition-colors ${TEXT_MUTED}`}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={isPending}
            className="h-9 px-4 rounded-lg bg-[var(--gbp-error)] text-white text-xs font-bold disabled:opacity-60 hover:opacity-90 transition-opacity">
            {isPending ? "Eliminando..." : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryManagerRow({
  category,
  isPending,
  onRename,
  onDelete,
}: {
  category: VendorCategoryOption;
  isPending: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draftName, setDraftName] = useState(category.name);

  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-1.5">
      <input
        value={draftName}
        onChange={(event) => setDraftName(event.target.value)}
        className="h-7 flex-1 rounded border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 text-xs"
      />
      <button
        type="button"
        onClick={() => onRename(draftName)}
        disabled={isPending || !draftName.trim() || draftName.trim() === category.name}
        className="h-7 rounded border border-[var(--gbp-border)] px-2 text-[11px] font-semibold disabled:opacity-50"
      >
        Guardar
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isPending || category.code === "otro"}
        className="h-7 rounded border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] px-2 text-[11px] font-semibold text-[var(--gbp-error)] disabled:opacity-50"
      >
        Eliminar
      </button>
    </div>
  );
}

// ─── Vendor Form Modal ─────────────────────────────────────────────────────────
function VendorFormModal({ vendor, branches, categories, onCategoriesChange, categoryApiBasePath, onClose, onSaved, apiBasePath }: {
  vendor: VendorRow | null;
  branches: Branch[];
  categories: VendorCategoryOption[];
  onCategoriesChange: (next: VendorCategoryOption[]) => void;
  categoryApiBasePath: string;
  onClose: () => void;
  onSaved: () => void;
  apiBasePath: string;
}) {
  const isEdit = Boolean(vendor);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isCategoryPending, setIsCategoryPending] = useState(false);

  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    category: vendor?.category ?? categories[0]?.code ?? "otro",
    contact_name: vendor?.contactName ?? "",
    contact_email: vendor?.contactEmail ?? "",
    contact_phone: vendor?.contactPhone ?? "",
    contact_whatsapp: vendor?.contactWhatsapp ?? "",
    website_url: vendor?.websiteUrl ?? "",
    address: vendor?.address ?? "",
    notes: vendor?.notes ?? "",
    is_active: vendor?.isActive ?? true,
    branch_ids: vendor?.branchIds ?? ([] as string[]),
  });

  useEffect(() => {
    if (categories.some((category) => category.code === form.category)) return;
    const fallback = categories[0]?.code ?? "otro";
    setForm((prev) => ({ ...prev, category: fallback }));
  }, [categories, form.category]);

  const toggleBranch = (id: string) => {
    setForm((prev) => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(id)
        ? prev.branch_ids.filter((b) => b !== id)
        : [...prev.branch_ids, id],
    }));
  };

  async function addCategory() {
    if (!newCategoryName.trim() || isCategoryPending) return;
    setIsCategoryPending(true);
    try {
      const res = await fetch(categoryApiBasePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo crear categoría");
      const created = data.category as VendorCategoryOption;
      onCategoriesChange([...categories, created]);
      setForm((prev) => ({ ...prev, category: created.code }));
      setNewCategoryName("");
      toast.success("Categoría creada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear categoría");
    } finally {
      setIsCategoryPending(false);
    }
  }

  async function renameCategory(categoryId: string, name: string) {
    if (!name.trim() || isCategoryPending) return;
    setIsCategoryPending(true);
    try {
      const res = await fetch(`${categoryApiBasePath}/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo editar categoría");
      const updated = data.category as VendorCategoryOption;
      const prev = categories.find((category) => category.id === categoryId);
      onCategoriesChange(categories.map((category) => (category.id === categoryId ? updated : category)));
      if (prev?.code && form.category === prev.code) {
        setForm((current) => ({ ...current, category: updated.code }));
      }
      toast.success("Categoría actualizada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al editar categoría");
    } finally {
      setIsCategoryPending(false);
    }
  }

  async function deleteCategory(categoryId: string, categoryCode: string) {
    if (isCategoryPending) return;
    setIsCategoryPending(true);
    try {
      const res = await fetch(`${categoryApiBasePath}/${categoryId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo eliminar categoría");
      const next = categories.filter((category) => category.id !== categoryId);
      onCategoriesChange(next);
      if (form.category === categoryCode) {
        const fallback = next.find((category) => category.code === "otro") ?? next[0];
        setForm((prev) => ({ ...prev, category: fallback?.code ?? "otro" }));
      }
      toast.success("Categoría eliminada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar categoría");
    } finally {
      setIsCategoryPending(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const url = isEdit ? `${apiBasePath}/${vendor!.id}` : apiBasePath;
        const res = await fetch(url, {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error ?? "Error al guardar el proveedor");
          return;
        }
        toast.success(isEdit ? "Proveedor actualizado correctamente" : "Proveedor creado correctamente");
        onSaved();
      } catch {
        setError("No se pudo conectar con el servidor");
      }
    });
  };

  const inputCls = "w-full h-9 px-3 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--gbp-accent)]/30 focus:border-[var(--gbp-accent)] transition-colors";
  const labelCls = `block text-xs font-semibold mb-1 ${TEXT_MUTED}`;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`rounded-2xl border w-[min(580px,95vw)] max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col ${CARD}`}>
        {/* Header */}
        <div className={`flex justify-between items-center px-6 py-4 border-b border-[var(--gbp-border)] sticky top-0 z-10 rounded-t-2xl bg-[var(--gbp-surface)]`}>
          <div>
            <h2 className={`text-base font-bold ${TEXT_STRONG}`}>{isEdit ? "Editar proveedor" : "Nuevo proveedor"}</h2>
            <p className={`text-xs mt-0.5 ${TEXT_MUTED}`}>{isEdit ? "Actualizá los datos del proveedor" : "Completá los datos para agregar el proveedor"}</p>
          </div>
          <button onClick={onClose} className={ACTION_BTN}><X className="h-3.5 w-3.5" /></button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className={labelCls}>Nombre *</label>
            <input className={inputCls} value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Ej: Distribuidora La Preferida" required maxLength={200} />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <label className={labelCls}>Categoría *</label>
              <button
                type="button"
                onClick={() => setCategoriesOpen((prev) => !prev)}
                className="rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-1 text-[11px] font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
              >
                {categoriesOpen ? "Cerrar gestor" : "Gestionar"}
              </button>
            </div>
            <select className={inputCls} value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as typeof form.category }))} required>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.code}>{cat.name}</option>
              ))}
            </select>
            {categoriesOpen ? (
              <div className="mt-2 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="mb-2 text-[11px] text-[var(--gbp-text2)]">
                  Crea, edita o elimina categorías sin salir del modal.
                </p>
                <div className="mb-3 flex gap-2">
                  <input
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="Nueva categoría"
                    className="h-8 flex-1 rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={addCategory}
                    disabled={isCategoryPending || !newCategoryName.trim()}
                    className="h-8 rounded-md bg-[var(--gbp-text)] px-3 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Agregar
                  </button>
                </div>
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {categories.map((category) => (
                    <CategoryManagerRow
                      key={`${category.id}:${category.name}`}
                      category={category}
                      isPending={isCategoryPending}
                      onRename={(name) => renameCategory(category.id, name)}
                      onDelete={() => deleteCategory(category.id, category.code)}
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Nombre de contacto</label>
              <input className={inputCls} value={form.contact_name}
                onChange={(e) => setForm((p) => ({ ...p, contact_name: e.target.value }))}
                placeholder="Juan Pérez" maxLength={200} />
            </div>
            <div>
              <label className={labelCls}>Teléfono</label>
              <input className={inputCls} value={form.contact_phone}
                onChange={(e) => setForm((p) => ({ ...p, contact_phone: e.target.value }))}
                placeholder="+1 555 123 4567" maxLength={50} />
            </div>
          </div>

          <div>
            <label className={labelCls}>WhatsApp</label>
            <input className={inputCls} value={form.contact_whatsapp}
              onChange={(e) => setForm((p) => ({ ...p, contact_whatsapp: e.target.value }))}
              placeholder="+54 9 11 1234 5678" maxLength={50} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Email</label>
              <input className={inputCls} type="email" value={form.contact_email}
                onChange={(e) => setForm((p) => ({ ...p, contact_email: e.target.value }))}
                placeholder="contacto@proveedor.com" />
            </div>
            <div>
              <label className={labelCls}>Sitio web</label>
              <input className={inputCls} value={form.website_url}
                onChange={(e) => setForm((p) => ({ ...p, website_url: e.target.value }))}
                placeholder="https://proveedor.com" />
            </div>
          </div>

          <div>
            <label className={labelCls}>Dirección</label>
            <input className={inputCls} value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              placeholder="Calle y número, ciudad" maxLength={500} />
          </div>

          {/* Locaciones */}
          <div>
            <label className={labelCls}>
              Locaciones asignadas{" "}
              <span className="font-normal text-[var(--gbp-muted)]">(sin selección = visible en todas)</span>
            </label>
            {branches.length === 0 ? (
              <p className={`text-xs ${TEXT_MUTED}`}>No hay locaciones activas para asignar.</p>
            ) : (
              <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
                <p className="mb-2 text-[11px] text-[var(--gbp-text2)]">
                  Elegí las locaciones donde será visible este proveedor.
                </p>
                <label className="mb-2 inline-flex items-center gap-2 border-b border-[var(--gbp-border)] pb-2 text-xs font-semibold text-[var(--gbp-text)]">
                  <input
                    type="checkbox"
                    checked={form.branch_ids.length === branches.length && branches.length > 0}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setForm((prev) => ({
                        ...prev,
                        branch_ids: checked ? branches.map((branch) => branch.id) : [],
                      }));
                    }}
                    className="h-[14px] w-[14px] accent-[var(--gbp-accent)]"
                  />
                  Todas las locaciones
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs text-[var(--gbp-text2)]">
                  {branches.map((branch) => (
                    <label key={branch.id} className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.branch_ids.includes(branch.id)}
                        onChange={() => toggleBranch(branch.id)}
                        className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
                      />
                      {branch.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className={labelCls}>Notas</label>
            <textarea
              className={`${inputCls} h-auto min-h-[80px] py-2 resize-y font-[inherit]`}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Condiciones de pago, horarios de entrega, observaciones..."
              maxLength={2000} />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active}
                onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                className="h-4 w-4 rounded" />
              <span className={`text-xs font-semibold ${TEXT_STRONG}`}>Proveedor activo</span>
            </label>
          )}

          {error && (
            <div className="px-3.5 py-2.5 rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] text-xs">
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end mt-1">
            <button type="button" onClick={onClose}
              className={`h-9 px-4 rounded-lg border border-[var(--gbp-border)] text-xs font-semibold hover:bg-[var(--gbp-surface2)] transition-colors ${TEXT_MUTED}`}>
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="h-9 px-5 rounded-lg bg-[var(--gbp-text)] text-[var(--gbp-bg)] text-xs font-bold hover:bg-[var(--gbp-accent)] disabled:opacity-60 transition-colors">
              {isPending ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear proveedor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Table Workspace ──────────────────────────────────────────────────────
export default function VendorsTableWorkspace({
  initialVendors,
  branches,
  initialCategories,
  organizationId,
  canCreate = true,
  canEdit = true,
  canDelete = true,
  apiBasePath = "/api/company/vendors",
  historyEndpointBase = "/api/company/vendors",
  deferredDataUrl,
}: Props) {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors);
  const [branchOptions, setBranchOptions] = useState<Branch[]>(branches);
  const [categories, setCategories] = useState<VendorCategoryOption[]>(
    initialCategories.length
      ? initialCategories
      : DEFAULT_VENDOR_CATEGORIES.map((category) => ({
          id: `default-${category.value}`,
          code: category.value,
          name: category.label,
          isSystem: true,
        })),
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null);
  const [detailVendor, setDetailVendor] = useState<VendorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const categoryNameByCode = useMemo(
    () => new Map(categories.map((category) => [category.code, category.name])),
    [categories],
  );

  // Sync initial vendors on navigation refresh
  useEffect(() => {
    setVendors(initialVendors);
  }, [initialVendors]);

  useEffect(() => {
    setBranchOptions(branches);
  }, [branches]);

  useEffect(() => {
    setCategories(
      initialCategories.length
        ? initialCategories
        : DEFAULT_VENDOR_CATEGORIES.map((category) => ({
            id: `default-${category.value}`,
            code: category.value,
            name: category.label,
            isSystem: true,
          })),
    );
  }, [initialCategories]);

  useEffect(() => {
    if (!deferredDataUrl) return;
    const controller = new AbortController();

    void fetch(deferredDataUrl, { method: "GET", cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(data?.vendors)) return;

        const normalized = (data.vendors as Array<Record<string, unknown>>).map((row) => {
          const branchIdsRaw = Array.isArray(row.branchIds)
            ? row.branchIds
            : Array.isArray(row.branch_ids)
              ? row.branch_ids
              : [];
          const branchNamesRaw = Array.isArray(row.branchNames)
            ? row.branchNames
            : Array.isArray(row.branch_names)
              ? row.branch_names
              : [];

          return {
            id: String(row.id ?? ""),
            organizationId: String(row.organizationId ?? row.organization_id ?? organizationId),
            name: String(row.name ?? ""),
            category: String(row.category ?? "otro") as VendorRow["category"],
            contactName: (row.contactName ?? row.contact_name ?? null) as string | null,
            contactEmail: (row.contactEmail ?? row.contact_email ?? null) as string | null,
            contactPhone: (row.contactPhone ?? row.contact_phone ?? null) as string | null,
            contactWhatsapp: (row.contactWhatsapp ?? row.contact_whatsapp ?? null) as string | null,
            websiteUrl: (row.websiteUrl ?? row.website_url ?? null) as string | null,
            address: (row.address ?? null) as string | null,
            notes: (row.notes ?? null) as string | null,
            isActive: Boolean(row.isActive ?? row.is_active ?? true),
            createdAt: String(row.createdAt ?? row.created_at ?? new Date(0).toISOString()),
            updatedAt: String(row.updatedAt ?? row.updated_at ?? new Date(0).toISOString()),
            branchIds: branchIdsRaw.map((value) => String(value)),
            branchNames: branchNamesRaw.map((value) => String(value)),
          } satisfies VendorRow;
        });

        setVendors(normalized);
        if (Array.isArray(data?.branches)) {
          setBranchOptions((data.branches as Array<Record<string, unknown>>)
            .map((row) => ({ id: String(row.id ?? ""), name: String(row.name ?? "") }))
            .filter((row) => row.id && row.name));
        }
        if (Array.isArray(data?.categories)) {
          setCategories((data.categories as Array<Record<string, unknown>>)
            .map((row) => ({
              id: String(row.id ?? ""),
              code: String(row.code ?? ""),
              name: String(row.name ?? row.code ?? ""),
              isSystem: Boolean(row.isSystem ?? row.is_system),
            }))
            .filter((row) => row.id && row.code && row.name));
        }
      })
      .catch(() => {
        // keep current snapshot
      });

    return () => controller.abort();
  }, [deferredDataUrl, organizationId, refreshKey]);

  useEffect(() => {
    if (!deferredDataUrl) return;
    const supabase = createSupabaseBrowserClient();
    const orgFilter = `organization_id=eq.${organizationId}`;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setRefreshKey((prev) => prev + 1);
      }, 300);
    };

    const channel = supabase
      .channel(`vendors-workspace-${organizationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendors", filter: orgFilter }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "vendor_locations", filter: orgFilter }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "branches", filter: orgFilter }, scheduleRefresh)
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [deferredDataUrl, organizationId]);

  useEffect(() => {
    if (!deferredDataUrl) return;

    const triggerRefresh = () => setRefreshKey((prev) => prev + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") triggerRefresh();
    };

    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      triggerRefresh();
    }, 15000);

    window.addEventListener("focus", triggerRefresh);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", triggerRefresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [deferredDataUrl]);

  // suppress unused warning
  void organizationId;

  const handleSaved = useCallback(() => {
    setModalOpen(false);
    setEditingVendor(null);
    setDetailVendor(null);
    if (deferredDataUrl) {
      setRefreshKey((prev) => prev + 1);
      return;
    }
    router.refresh();
  }, [deferredDataUrl, router]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        const res = await fetch(`${apiBasePath}/${deleteTarget.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("No se pudo eliminar el proveedor");
        toast.success("Proveedor eliminado correctamente");
        setDeleteTarget(null);
        setDetailVendor(null);
        if (deferredDataUrl) {
          setRefreshKey((prev) => prev + 1);
        } else {
          router.refresh();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error al eliminar";
        toast.error(message);
      }
    });
  }, [apiBasePath, deferredDataUrl, deleteTarget, router]);

  const filtered = vendors.filter((v) => {
    if (!showInactive && !v.isActive) return false;
    if (filterCategory && v.category !== filterCategory) return false;
    if (filterBranch) {
      const noLocs = v.branchIds.length === 0;
      if (!noLocs && !v.branchIds.includes(filterBranch)) return false;
    }
    if (search) {
      const q = search.toLowerCase();
        return (
          v.name.toLowerCase().includes(q) ||
          v.contactName?.toLowerCase().includes(q) ||
          v.contactEmail?.toLowerCase().includes(q) ||
          v.contactPhone?.includes(q) ||
          v.contactWhatsapp?.includes(q)
        );
      }
    return true;
  });

  const activeCategoryLabel = useMemo(() => {
    if (!filterCategory) return null;
    return categories.find((category) => category.code === filterCategory)?.name ?? filterCategory;
  }, [categories, filterCategory]);

  const selectCls = `h-9 px-3 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-xs font-medium text-[var(--gbp-text2)] focus:outline-none focus:ring-2 focus:ring-[var(--gbp-accent)]/30 focus:border-[var(--gbp-accent)] transition-colors`;
  const categoryApiBasePath = `${apiBasePath}/categories`;

  return (
    <div className="flex flex-col gap-0 h-full min-h-0">
      {/* Toolbar */}
      <SlideUp>
        <OperationHeaderCard
          eyebrow="Directorio de proveedores"
          title="Mis Proveedores"
          description="Gestiona tu directorio de proveedores, categorías, alcance por locación y estado operativo."
          eyebrowClassName={`text-[11px] font-semibold tracking-[0.14em] uppercase ${TEXT_MUTED}`}
          titleClassName={`mt-1 text-2xl font-bold tracking-tight ${TEXT_STRONG}`}
          descriptionClassName={`mt-1 text-sm ${TEXT_MUTED}`}
          action={canCreate ? (
            <button
              onClick={() => { setEditingVendor(null); setModalOpen(true); }}
              className="inline-flex h-[33px] items-center gap-1 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-white hover:bg-[var(--gbp-accent)]"
            >
              <Plus className="h-3.5 w-3.5" /> Nuevo Proveedor
            </button>
          ) : null}
        />
      </SlideUp>

      {/* Filters */}
      <SlideUp delay={0.05}>
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--gbp-muted)] pointer-events-none" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar proveedores..."
              className={`w-full h-9 pl-9 pr-3 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-xs text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--gbp-accent)]/30 focus:border-[var(--gbp-accent)] transition-colors`} />
          </div>

          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={selectCls}>
            <option value="">Todas las categorías</option>
            {categories.map((c) => <option key={c.id} value={c.code}>{c.name}</option>)}
          </select>

          {branchOptions.length > 0 && (
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={selectCls}>
              <option value="">Todas las locaciones</option>
              {branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          <label className={`flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap ${TEXT_MUTED}`}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded" />
            Mostrar inactivos
          </label>
        </div>
      </SlideUp>

      {/* Table / Empty */}
      <SlideUp delay={0.1}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={search || filterCategory || filterBranch ? "Sin resultados" : "Sin proveedores aún"}
            description={search || filterCategory || filterBranch
              ? "Probá ajustando los filtros de búsqueda."
              : "Agregá tu primer proveedor para comenzar a gestionar el directorio."}
            action={canCreate && !search && !filterCategory && !filterBranch ? (
              <button onClick={() => { setEditingVendor(null); setModalOpen(true); }}
                className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-4 text-xs font-bold text-[var(--gbp-bg)] hover:bg-[var(--gbp-accent)] transition-colors">
                <Plus className="h-3.5 w-3.5" /> Nuevo proveedor
              </button>
            ) : undefined}
          />
        ) : (
          <div className={`overflow-x-auto rounded-xl border ${CARD}`}>
            <div className="flex items-center justify-between border-b border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-3">
              <p className={`text-sm font-bold ${TEXT_STRONG}`}>
                {activeCategoryLabel
                  ? `Listado de proveedores: ${activeCategoryLabel} (${filtered.length})`
                  : `Listado de proveedores (${filtered.length})`}
              </p>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.09em] ${TEXT_MUTED}`}>
                cantidad
              </p>
            </div>
            <table className="w-full text-sm min-w-[700px] border-collapse">
              <thead>
                <tr className="bg-[var(--gbp-bg)]">
                  {[
                    { label: "Proveedor" },
                    { label: "Categoría" },
                    { label: "Contacto" },
                    { label: "Teléfono" },
                    { label: "Locaciones" },
                    { label: "Estado" },
                    { label: "Acciones", align: "right" as const },
                  ].map((column) => (
                    <th
                      key={column.label}
                      className={`px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] border-b border-[var(--gbp-border)] whitespace-nowrap ${column.align === "right" ? "text-right" : "text-left"} ${TEXT_MUTED}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr key={v.id} onClick={() => setDetailVendor(v)}
                    className="cursor-pointer border-b border-[var(--gbp-border)] last:border-0 hover:bg-[var(--gbp-surface2)] transition-colors group">
                    <td className="px-4 py-3">
                      <div className={`flex items-center gap-2 font-semibold text-sm ${TEXT_STRONG}`}>
                        <span className={`h-2 w-2 rounded-full flex-shrink-0 ${v.isActive ? "bg-emerald-500" : "bg-[var(--gbp-muted)]"}`} />
                        {v.name}
                      </div>
                    </td>
                    <td className="px-4 py-3"><CategoryBadge category={v.category} label={categoryNameByCode.get(v.category)} /></td>
                    <td className={`px-4 py-3 text-xs ${TEXT_MUTED}`}>
                      {v.contactName ?? <span className="text-[var(--gbp-border2)]">—</span>}
                    </td>
                    <td className={`px-4 py-3 text-xs whitespace-nowrap ${TEXT_MUTED}`}>
                      {v.contactPhone ?? <span className="text-[var(--gbp-border2)]">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {v.branchNames.length === 0 ? (
                        <span className={`text-xs italic ${TEXT_MUTED}`}>Todas</span>
                      ) : (
                        <ScopePillsOverflow
                          pills={v.branchNames.map((name) => ({ name, type: "location" as const }))}
                          max={3}
                          variant="initials"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge active={v.isActive} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setDetailVendor(v); }}
                          className={ACTION_BTN}
                          title="Ver"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canEdit ? (
                          <button onClick={(e) => { e.stopPropagation(); setEditingVendor(v); setModalOpen(true); }}
                            className={ACTION_BTN} title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                        {canDelete ? (
                          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                            className={ACTION_BTN_DANGER} title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SlideUp>

      {/* Modals / Panels */}
      {(modalOpen || editingVendor) && (
        <VendorFormModal vendor={editingVendor} branches={branchOptions}
          categories={categories}
          onCategoriesChange={setCategories}
          categoryApiBasePath={categoryApiBasePath}
          onClose={() => { setModalOpen(false); setEditingVendor(null); }}
          onSaved={handleSaved}
          apiBasePath={apiBasePath} />
      )}

      {detailVendor && !modalOpen && (
        <VendorDetailPanel vendor={detailVendor}
          categoryLabel={categoryNameByCode.get(detailVendor.category)}
          onClose={() => setDetailVendor(null)}
          onEdit={() => { if (canEdit) { setEditingVendor(detailVendor); setModalOpen(true); } }}
          onDelete={() => { if (canDelete) { setDeleteTarget(detailVendor); } }}
          canEdit={canEdit}
          canDelete={canDelete}
          historyEndpointBase={historyEndpointBase} />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog vendor={deleteTarget}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          isPending={isDeleting} />
      )}
    </div>
  );
}
