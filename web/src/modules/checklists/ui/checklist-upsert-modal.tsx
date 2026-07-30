"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import {
  ScopeModalContent,
  ScopeModalDivider,
  ScopeModalField,
  ScopeModalSection,
  ScopeModalToggleRow,
  ScopeModalZones,
  SCOPE_MODAL_INPUT,
  SCOPE_MODAL_SELECT,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_HEADER,
  SCOPE_MODAL_PANEL,
} from "@/shared/ui/scope-modal-layout";
import { SubmitButton } from "@/shared/ui/submit-button";
import { RecurrenceSelector } from "@/shared/ui/recurrence-selector";
import { ChecklistItemsBuilder } from "@/modules/checklists/ui/checklist-items-builder";
import { createChecklistTemplateAction } from "@/modules/checklists/actions";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { flattenChecklistSectionTexts, parseChecklistSections } from "@/modules/checklists/lib/sections";

// SMS sigue funcionando en el backend; se oculta de la UI por ahora.
const SHOW_SMS_CHANNEL = false;

type EditingTemplate = {
  id: string;
  name?: string;
  checklist_type?: string;
  shift?: string;
  repeat_every?: string;
  is_active?: boolean;
  target_scope?: Record<string, string[]>;
  templateSections?: Array<{ name: string; items: Array<{ id: string; label: string }> }>;
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
  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [scopeValid, setScopeValid] = useState(true);

  useEffect(() => {
    if (submitEndpoint) return;
    if (state.message) {
      if (state.success) {
        toast.success(editingTemplate ? "Checklist updated successfully." : "Checklist created successfully.");
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
        toast.error("Unable to save the checklist.");
      }
    }
  }, [editingTemplate, onClose, onSubmitted, redirectPath, router, state, submitEndpoint]);

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
      toast.error("A template name is required.");
      return;
    }

    let items = "";
    if (sectionsPayload) {
      const sections = parseChecklistSections(sectionsPayload);
      if (sections.length === 0) {
        toast.error("The section format is invalid.");
        return;
      }
      items = flattenChecklistSectionTexts(sections).join("\n");
    } else {
      items = legacyItems;
    }

    if (!items.trim()) {
      toast.error("Add at least one item.");
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
          scope_mode: String(formData.get("scope_mode") ?? "").trim() || undefined,
          sections_payload: sectionsPayload || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error("Unable to save the checklist.");
      }
      toast.success(templateId ? "Checklist updated successfully." : "Checklist created successfully.");
      startTransition(() => {
        onSubmitted?.();
        if (onClose) {
          onClose();
        } else {
          router.push(redirectPath);
        }
        router.refresh();
      });
    } catch {
      toast.error("Unable to save the checklist.");
    } finally {
      setIsApiPending(false);
    }
  }

  const pending = submitEndpoint ? isApiPending : isPending;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className={SCOPE_MODAL_PANEL}>
        <div className={SCOPE_MODAL_HEADER}>
          <div>
            <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">{action === "edit" ? "Editar checklist" : "Nuevo checklist"}</p>
            <p className="mt-0.5 text-[11.5px] text-[var(--gbp-text2)]">
              {action === "edit"
                ? "Los cambios en los ítems se aplican en el próximo reparto"
                : "Quien esté en el alcance lo verá en su portal para completarlo"}
            </p>
          </div>
          <button type="button" onClick={handleClose} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">✕</button>
        </div>
        <form
          action={submitEndpoint ? undefined : formAction}
          onSubmit={submitEndpoint ? handleApiSubmit : undefined}
          className={SCOPE_MODAL_FORM}
        >
          {editingTemplate ? <input type="hidden" name="template_id" value={editingTemplate.id} /> : null}
          <ScopeModalZones>
            <ScopeModalContent>
              <ScopeModalSection label="Información general" />

              <ScopeModalField label="Nombre del checklist">
                <input
                  name="name"
                  required
                  defaultValue={editingTemplate?.name ?? ""}
                  placeholder="Ej: Apertura Cocina - Turno Mañana"
                  data-testid="checklist-title-input"
                  className={SCOPE_MODAL_INPUT}
                />
              </ScopeModalField>

              <ScopeModalField label="Tipo de checklist">
                <select
                  name="checklist_type"
                  defaultValue={editingTemplate?.checklist_type ?? "opening"}
                  className={SCOPE_MODAL_SELECT}
                >
                  <option value="opening">Apertura</option>
                  <option value="closing">Cierre</option>
                  <option value="prep">Prep</option>
                  <option value="custom">Otro</option>
                </select>
              </ScopeModalField>

              <ScopeModalField label="Turno">
                <select name="shift" defaultValue={editingTemplate?.shift ?? "1er Shift"} className={SCOPE_MODAL_SELECT}>
                  <option>1er Shift</option>
                  <option>2do Shift</option>
                  <option>3er Shift</option>
                </select>
              </ScopeModalField>

              <ScopeModalField label="Estado">
                <select
                  name="template_status"
                  defaultValue={editingTemplate?.is_active ? "active" : "draft"}
                  className={SCOPE_MODAL_SELECT}
                >
                  <option value="active">Activo</option>
                  <option value="draft">Borrador</option>
                </select>
              </ScopeModalField>

              <ScopeModalDivider />
              <ScopeModalSection label="Frecuencia" />
              <RecurrenceSelector
                initialType={editingTemplate?.scheduledJob?.recurrence_type || editingTemplate?.repeat_every || "daily"}
                initialDays={editingTemplate?.scheduledJob?.custom_days || []}
              />

              <ScopeModalDivider />
              <ScopeModalSection label="Ítems del checklist" />
              <ChecklistItemsBuilder
                initialSections={
                  editingTemplate?.templateSections?.length
                    ? editingTemplate.templateSections
                    : [{ name: "General", items: editingTemplate?.templateItems?.map((item) => item.label) ?? [""] }]
                }
              />

              {!editingTemplate ? (
                <>
                  <ScopeModalDivider />
                  <ScopeModalSection label="Publicación" />
                  <ScopeModalToggleRow
                    label="Enviar también por email"
                    sub="Solo a quien tenga email cargado"
                    checked={notifyEmail}
                    onChange={setNotifyEmail}
                  />
                  {SHOW_SMS_CHANNEL ? (
                    <ScopeModalToggleRow label="Enviar también por SMS" checked={notifySms} onChange={setNotifySms} />
                  ) : null}
                  {notifySms ? <input type="hidden" name="notify_channel" value="sms" /> : null}
                  {notifyEmail ? <input type="hidden" name="notify_channel" value="email" /> : null}
                </>
              ) : null}
            </ScopeModalContent>

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
            modeInputName="scope_mode"
            question="¿Quién tiene que completar este checklist?"
            audienceLabel="Lo completarán"
            onValidityChange={setScopeValid}
            initialLocations={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.locations) ? ((editingTemplate?.target_scope as Record<string, string[]>).locations ?? []) : []}
            initialDepartments={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.department_ids) ? ((editingTemplate?.target_scope as Record<string, string[]>).department_ids ?? []) : []}
            initialPositions={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.position_ids) ? ((editingTemplate?.target_scope as Record<string, string[]>).position_ids ?? []) : []}
            initialUsers={Array.isArray((editingTemplate?.target_scope as Record<string, string[]> | undefined)?.users) ? ((editingTemplate?.target_scope as Record<string, string[]>).users ?? []) : []}
            allowedLocationIds={allowedLocationIds}
            lockLocationSelection={lockLocationSelection}
            locationHelperText={locationHelperText}
            />
          </ScopeModalZones>

          <div className={SCOPE_MODAL_FOOTER}>
            <button type="button" onClick={handleClose} className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]">Cancelar</button>
            <SubmitButton 
              label={editingTemplate ? "Actualizar Checklist" : "Guardar Checklist"}
              pendingLabel={editingTemplate ? "Actualizando..." : "Guardando..."}
              pending={pending}
              disabled={!scopeValid}
              className="px-5 py-2 text-sm font-bold" 
            />
          </div>
        </form>
      </div>
    </div>
  );
}
