"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Mail, MessageSquare, Smartphone } from "lucide-react";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";
import { RecurrenceSelector } from "@/shared/ui/recurrence-selector";
import { ChecklistItemsBuilder } from "@/modules/checklists/ui/checklist-items-builder";
import { createChecklistTemplateAction } from "@/modules/checklists/actions";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

type EditingTemplate = {
  id: string;
  name?: string;
  checklist_type?: string;
  shift?: string;
  repeat_every?: string;
  is_active?: boolean;
  target_scope?: Record<string, string[]>;
  templateSections?: Array<{ name: string; items: string[] }>;
  templateItems?: Array<{ label: string }>;
  scheduledJob?: { recurrence_type: string; custom_days: number[]; cron_expression?: string } | null;
};

type ChecklistUpsertModalProps = {
  onClose?: () => void;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  action?: string;
  editingTemplate?: EditingTemplate | null;
  submitEndpoint?: string;
  redirectPath?: string;
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
  locationHelperText?: string;
  onSubmitted?: () => void;
};

export function ChecklistUpsertModal({
  onClose,
  branches,
  departments,
  positions,
  users,
  action,
  editingTemplate,
  submitEndpoint,
  redirectPath = "/app/checklists",
  allowedLocationIds,
  lockLocationSelection,
  locationHelperText,
  onSubmitted,
}: ChecklistUpsertModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createChecklistTemplateAction, { success: false, message: "" });
  const [isApiPending, setIsApiPending] = useState(false);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);

  useEffect(() => {
    if (submitEndpoint) return;
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        startTransition(() => {
          onSubmitted?.();
          if (onClose) {
            onClose();
          } else {
            router.push(redirectPath);
          }
          router.refresh();
        });
      } else {
        toast.error(state.message);
      }
    }
  }, [onClose, onSubmitted, redirectPath, router, state, submitEndpoint]);

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push(redirectPath);
  };

  async function handleApiSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!submitEndpoint || isApiPending) return;

    const formData = new FormData(event.currentTarget);
    const templateId = String(formData.get("template_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const sectionsPayload = String(formData.get("sections_payload") ?? "").trim();
    const legacyItems = String(formData.get("items") ?? "").trim();

    if (!name) {
      toast.error("Nombre de plantilla obligatorio");
      return;
    }

    let items = "";
    if (sectionsPayload) {
      try {
        const parsed = JSON.parse(sectionsPayload) as Array<{ items?: unknown[] }>;
        const flatItems = (parsed ?? [])
          .flatMap((section) => (Array.isArray(section?.items) ? section.items : []))
          .map((item) => String(item).trim())
          .filter(Boolean);
        items = flatItems.join("\n");
      } catch {
        toast.error("Formato de secciones inválido");
        return;
      }
    } else {
      items = legacyItems;
    }

    if (!items.trim()) {
      toast.error("Agrega al menos un item");
      return;
    }

    setIsApiPending(true);
    try {
      const method = templateId ? "PATCH" : "POST";
      const response = await fetch(submitEndpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: templateId || undefined,
          name,
          items,
          checklist_type: String(formData.get("checklist_type") ?? "custom").trim() || "custom",
          shift: String(formData.get("shift") ?? "1er Shift").trim() || "1er Shift",
          repeat_every: String(formData.get("recurrence_type") ?? formData.get("repeat_every") ?? "daily").trim() || "daily",
          template_status: String(formData.get("template_status") ?? "active").trim() || "active",
          location_scope: formData.getAll("location_scope").map(String).filter(Boolean),
          department_scope: formData.getAll("department_scope").map(String).filter(Boolean),
          position_scope: formData.getAll("position_scope").map(String).filter(Boolean),
          user_scope: formData.getAll("user_scope").map(String).filter(Boolean),
          sections_payload: sectionsPayload || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo guardar checklist");
      }
      toast.success(templateId ? "Checklist actualizado correctamente" : "Checklist creado correctamente");
      startTransition(() => {
        onSubmitted?.();
        if (onClose) {
          onClose();
        } else {
          router.push(redirectPath);
        }
        router.refresh();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar checklist");
    } finally {
      setIsApiPending(false);
    }
  }

  const pending = submitEndpoint ? isApiPending : isPending;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="flex max-h-[90vh] w-[680px] max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[var(--gbp-shadow-xl)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 pb-4 pt-5">
          <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">{action === "edit" ? "Editar Checklist" : "Nuevo Checklist"}</p>
          <button type="button" onClick={handleClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">✕</button>
        </div>
        <form action={submitEndpoint ? undefined : formAction} onSubmit={submitEndpoint ? handleApiSubmit : undefined}>
          {editingTemplate ? <input type="hidden" name="template_id" value={editingTemplate.id} /> : null}
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <h3 className="mb-3 border-b-[1.5px] border-[var(--gbp-border)] pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Informacion general</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 sm:col-span-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Nombre del checklist</span>
                <input name="name" required defaultValue={editingTemplate?.name ?? ""} placeholder="Ej: Apertura Cocina - Turno Manana" className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)] placeholder:text-[var(--gbp-muted)]" data-testid="checklist-title-input" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Tipo de checklist</span>
                <select name="checklist_type" defaultValue={editingTemplate?.checklist_type ?? "opening"} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]">
                  <option value="opening">Apertura</option>
                  <option value="closing">Cierre</option>
                  <option value="prep">Prep</option>
                  <option value="custom">Otro</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Shift</span>
                <select name="shift" defaultValue={editingTemplate?.shift ?? "1er Shift"} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]">
                  <option>1er Shift</option>
                  <option>2do Shift</option>
                  <option>3er Shift</option>
                </select>
              </label>
              <div className="mt-4 grid gap-1.5 border-t border-[var(--gbp-border)] pt-4 sm:col-span-2">
                <RecurrenceSelector 
                  initialType={editingTemplate?.scheduledJob?.recurrence_type || editingTemplate?.repeat_every || "daily"} 
                  initialDays={editingTemplate?.scheduledJob?.custom_days || []} 
                />
              </div>
              <label className="grid gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Estado</span>
                <select name="template_status" defaultValue={editingTemplate?.is_active ? "active" : "draft"} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]">
                  <option value="active">Activo</option>
                  <option value="draft">Borrador</option>
                </select>
              </label>
            </div>
            <h3 className="mb-3 mt-6 border-b-[1.5px] border-[var(--gbp-border)] pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Visible para</h3>
            <ScopeSelector
              namespace="checklist"
              branches={branches}
              departments={departments}
              positions={positions}
              users={users}
              locationInputName="location_scope"
              departmentInputName="department_scope"
              positionInputName="position_scope"
              userInputName="user_scope"
              initialLocations={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.locations) ? ((editingTemplate?.target_scope as Record<string, string[]>).locations ?? []) : []}
              initialDepartments={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.department_ids) ? ((editingTemplate?.target_scope as Record<string, string[]>).department_ids ?? []) : []}
              initialPositions={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.position_ids) ? ((editingTemplate?.target_scope as Record<string, string[]>).position_ids ?? []) : []}
              initialUsers={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.users) ? ((editingTemplate?.target_scope as Record<string, string[]>).users ?? []) : []}
              allowedLocationIds={allowedLocationIds}
              lockLocationSelection={lockLocationSelection}
              locationHelperText={locationHelperText}
            />
            <h3 className="mb-3 mt-6 border-b-[1.5px] border-[var(--gbp-border)] pb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Items del checklist</h3>
            <ChecklistItemsBuilder
              initialSections={
                editingTemplate?.templateSections?.length
                  ? editingTemplate.templateSections
                  : [{ name: "General", items: editingTemplate?.templateItems?.map((item) => item.label) ?? [""] }]
              }
            />

            {!editingTemplate ? (
              <>
                <div className="my-4 h-px bg-[var(--gbp-border)]" />
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Notificar tambien via</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyWhatsapp((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyWhatsapp
                        ? "border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_14%,transparent)] text-[var(--gbp-accent)]"
                        : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifySms((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifySms
                        ? "border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_14%,transparent)] text-[var(--gbp-accent)]"
                        : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" /> SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyEmail((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyEmail
                        ? "border-[var(--gbp-accent)] bg-[color-mix(in_oklab,var(--gbp-accent)_14%,transparent)] text-[var(--gbp-accent)]"
                        : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]"
                    }`}
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </button>
                </div>
                {notifyWhatsapp ? <input type="hidden" name="notify_channel" value="whatsapp" /> : null}
                {notifySms ? <input type="hidden" name="notify_channel" value="sms" /> : null}
                {notifyEmail ? <input type="hidden" name="notify_channel" value="email" /> : null}
              </>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
            <button type="button" onClick={handleClose} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</button>
            <SubmitButton 
              label={editingTemplate ? "Actualizar Checklist" : "Guardar Checklist"}
              pendingLabel={editingTemplate ? "Actualizando..." : "Guardando..."}
              pending={pending}
              className="px-5 py-2 text-sm font-bold" 
            />
          </div>
        </form>
      </div>
    </div>
  );
}
