"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Truck, Plus, Search, Pencil, Trash2, X, ChevronRight, Phone, Mail, Globe, MapPin, FileText, Building2, Clock } from "lucide-react";
import { EmptyState } from "@/shared/ui/empty-state";
import { SlideUp } from "@/shared/ui/animations";
import type { VendorRow } from "@/modules/vendors/types";
import { VENDOR_CATEGORIES } from "@/modules/vendors/types";

// ─── Types ────────────────────────────────────────────────────────────────────
type Branch = { id: string; name: string };

type Props = {
  initialVendors: VendorRow[];
  branches: Branch[];
  organizationId: string;
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

function CategoryBadge({ category }: { category: string }) {
  const cls = CATEGORY_CLASS[category] ?? CATEGORY_CLASS.otro;
  const label = VENDOR_CATEGORIES.find((c) => c.value === category)?.label ?? category;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
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
  website_url: "Sitio Web",
  address: "Dirección",
  notes: "Notas",
  is_active: "Estado",
  branch_ids: "Locaciones"
};

function getChangesSummary(metadata: Record<string, any> | null) {
  if (!metadata) return null;
  const fields = [];
  if (metadata.changes) {
    fields.push(...Object.keys(metadata.changes).map(k => FIELD_LABELS[k] || k));
  }
  if (metadata.branch_ids) {
    fields.push("Locaciones");
  }
  
  if (fields.length > 0) {
    // Deduplicate fields (branch_ids might be in changes or outside depending on the payload)
    const unique = Array.from(new Set(fields));
    return `Editó: ${unique.join(", ")}`;
  }
  
  // For creations or deletions where we have name and category
  if (metadata.name) {
    return `Proveedor: ${metadata.name}`;
  }
  
  return null;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

// ─── History Tab ──────────────────────────────────────────────────────────────
function VendorHistoryTab({ vendorId }: { vendorId: string }) {
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/company/vendors/${vendorId}/history`)
      .then((r) => r.json())
      .then((d) => { setHistory(d.history ?? []); setLoading(false); })
      .catch(() => { setError("No se pudo cargar el historial"); setLoading(false); });
  }, [vendorId]);

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
              {summary && (
                <div className={`text-xs inline-flex w-fit bg-[var(--gbp-surface2)] px-2 py-1 rounded-md border border-[var(--gbp-border)] mt-0.5 ${TEXT_MUTED}`}>
                  {summary}
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
function VendorDetailPanel({ vendor, onClose, onEdit, onDelete }: {
  vendor: VendorRow;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const tabs = [{ id: "details" as const, label: "Detalles" }, { id: "history" as const, label: "Historial" }];

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
                <CategoryBadge category={vendor.category} />
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
            <VendorHistoryTab vendorId={vendor.id} />
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-[var(--gbp-border)] flex gap-2 sticky bottom-0 bg-[var(--gbp-surface)]">
          <button onClick={onEdit}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg border border-[var(--gbp-accent)] text-[var(--gbp-accent)] text-xs font-bold hover:bg-[var(--gbp-accent)] hover:text-white transition-colors">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
          <button onClick={onDelete}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-lg border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] text-xs font-bold hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_12%,transparent)] transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
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

// ─── Vendor Form Modal ─────────────────────────────────────────────────────────
function VendorFormModal({ vendor, branches, onClose, onSaved }: {
  vendor: VendorRow | null;
  branches: Branch[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(vendor);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: vendor?.name ?? "",
    category: vendor?.category ?? "alimentos",
    contact_name: vendor?.contactName ?? "",
    contact_email: vendor?.contactEmail ?? "",
    contact_phone: vendor?.contactPhone ?? "",
    website_url: vendor?.websiteUrl ?? "",
    address: vendor?.address ?? "",
    notes: vendor?.notes ?? "",
    is_active: vendor?.isActive ?? true,
    branch_ids: vendor?.branchIds ?? ([] as string[]),
  });

  const toggleBranch = (id: string) => {
    setForm((prev) => ({
      ...prev,
      branch_ids: prev.branch_ids.includes(id)
        ? prev.branch_ids.filter((b) => b !== id)
        : [...prev.branch_ids, id],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const url = isEdit ? `/api/company/vendors/${vendor!.id}` : "/api/company/vendors";
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
            <label className={labelCls}>Categoría *</label>
            <select className={inputCls} value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as typeof form.category }))} required>
              {VENDOR_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
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
              <p className={`text-xs ${TEXT_MUTED}`}>No hay sucursales activas para asignar.</p>
            ) : (
              <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)]">
                {branches.map((b) => {
                  const sel = form.branch_ids.includes(b.id);
                  return (
                    <button key={b.id} type="button" onClick={() => toggleBranch(b.id)}
                      className={`h-7 px-3 rounded-full text-xs font-semibold border transition-colors ${sel
                        ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent)] text-white"
                        : "border-[var(--gbp-border)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"}`}>
                      {b.name}
                    </button>
                  );
                })}
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
export default function VendorsTableWorkspace({ initialVendors, branches, organizationId }: Props) {
  const router = useRouter();
  const [vendors, setVendors] = useState<VendorRow[]>(initialVendors);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterBranch, setFilterBranch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorRow | null>(null);
  const [detailVendor, setDetailVendor] = useState<VendorRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [isDeleting, startDelete] = useTransition();

  // Sync initial vendors on navigation refresh
  useEffect(() => {
    setVendors(initialVendors);
  }, [initialVendors]);

  // suppress unused warning
  void organizationId;

  const handleSaved = useCallback(() => {
    setModalOpen(false);
    setEditingVendor(null);
    setDetailVendor(null);
    router.refresh();
  }, [router]);

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    startDelete(async () => {
      try {
        const res = await fetch(`/api/company/vendors/${deleteTarget.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("No se pudo eliminar el proveedor");
        toast.success("Proveedor eliminado correctamente");
        setDeleteTarget(null);
        setDetailVendor(null);
        router.refresh();
      } catch (e: any) {
        toast.error(e.message || "Error al eliminar");
      }
    });
  }, [deleteTarget, router]);

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
        v.contactPhone?.includes(q)
      );
    }
    return true;
  });

  const selectCls = `h-9 px-3 rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-xs font-medium text-[var(--gbp-text2)] focus:outline-none focus:ring-2 focus:ring-[var(--gbp-accent)]/30 focus:border-[var(--gbp-accent)] transition-colors`;

  return (
    <div className="flex flex-col gap-0 h-full min-h-0">
      {/* Toolbar */}
      <SlideUp>
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className={`inline-flex items-center gap-2 ${TEXT_STRONG}`}>
            <Truck className="h-4 w-4" />
            <h1 className="text-[18px] font-bold">Proveedores</h1>
          </div>
          <button
            onClick={() => { setEditingVendor(null); setModalOpen(true); }}
            className="inline-flex h-[33px] items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-3 text-xs font-bold text-[var(--gbp-bg)] hover:bg-[var(--gbp-accent)] transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nuevo Proveedor
          </button>
        </section>
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
            {VENDOR_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>

          {branches.length > 0 && (
            <select value={filterBranch} onChange={(e) => setFilterBranch(e.target.value)} className={selectCls}>
              <option value="">Todas las locaciones</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}

          <label className={`flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap ${TEXT_MUTED}`}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded" />
            Mostrar inactivos
          </label>
        </div>
      </SlideUp>

      {/* Count */}
      <p className={`mb-3 text-[11px] font-bold tracking-[0.11em] uppercase ${TEXT_MUTED}`}>
        {filtered.length} {filtered.length === 1 ? "proveedor" : "proveedores"}
        {search || filterCategory || filterBranch ? " encontrados" : ""}
      </p>

      {/* Table / Empty */}
      <SlideUp delay={0.1}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={Truck}
            title={search || filterCategory || filterBranch ? "Sin resultados" : "Sin proveedores aún"}
            description={search || filterCategory || filterBranch
              ? "Probá ajustando los filtros de búsqueda."
              : "Agregá tu primer proveedor para comenzar a gestionar el directorio."}
            action={!search && !filterCategory && !filterBranch ? (
              <button onClick={() => { setEditingVendor(null); setModalOpen(true); }}
                className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-lg bg-[var(--gbp-text)] px-4 text-xs font-bold text-[var(--gbp-bg)] hover:bg-[var(--gbp-accent)] transition-colors">
                <Plus className="h-3.5 w-3.5" /> Nuevo proveedor
              </button>
            ) : undefined}
          />
        ) : (
          <div className={`overflow-x-auto rounded-xl border ${CARD}`}>
            <table className="w-full text-sm min-w-[700px] border-collapse">
              <thead>
                <tr className="bg-[var(--gbp-bg)]">
                  {["Proveedor", "Categoría", "Contacto", "Teléfono", "Locaciones", "Estado", ""].map((h) => (
                    <th key={h} className={`px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.08em] border-b border-[var(--gbp-border)] whitespace-nowrap ${TEXT_MUTED}`}>
                      {h}
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
                    <td className="px-4 py-3"><CategoryBadge category={v.category} /></td>
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
                        <div className="flex flex-wrap gap-1">
                          {v.branchNames.slice(0, 2).map((name) => (
                            <span key={name} className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--gbp-text2)]">
                              {name}
                            </span>
                          ))}
                          {v.branchNames.length > 2 && (
                            <span className={`rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[11px] ${TEXT_MUTED}`}>
                              +{v.branchNames.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatusBadge active={v.isActive} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setEditingVendor(v); setModalOpen(true); }}
                          className={ACTION_BTN} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                          className={ACTION_BTN_DANGER} title="Eliminar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
        <VendorFormModal vendor={editingVendor} branches={branches}
          onClose={() => { setModalOpen(false); setEditingVendor(null); }}
          onSaved={handleSaved} />
      )}

      {detailVendor && !modalOpen && (
        <VendorDetailPanel vendor={detailVendor}
          onClose={() => setDetailVendor(null)}
          onEdit={() => { setEditingVendor(detailVendor); setModalOpen(true); }}
          onDelete={() => setDeleteTarget(detailVendor)} />
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
