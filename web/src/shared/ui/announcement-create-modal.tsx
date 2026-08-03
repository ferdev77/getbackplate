"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createAnnouncementAction } from "@/modules/announcements/actions";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import {
  ScopeModalContent,
  ScopeModalDialog,
  ScopeModalHeader,
  ScopeModalDivider,
  ScopeModalField,
  ScopeModalSection,
  ScopeModalToggleRow,
  ScopeModalZones,
  SCOPE_MODAL_INPUT,
  SCOPE_MODAL_SELECT,
  SCOPE_MODAL_TEXTAREA,
  SCOPE_MODAL_FOOTER,
  SCOPE_MODAL_FORM,
  SCOPE_MODAL_PANEL,
} from "@/shared/ui/scope-modal-layout";
import { SubmitButton } from "@/shared/ui/submit-button";
import { RecurrenceSelector } from "@/shared/ui/recurrence-selector";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

// SMS sigue funcionando en el backend; se oculta de la UI por ahora.
const SHOW_SMS_CHANNEL = false;

type AnnouncementCreateModalProps = {
  onClose?: () => void;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  publisherName: string;
  mode?: "create" | "edit";
  initial?: {
    id: string;
    kind: string;
    title: string;
    body: string;
    expires_at: string | null;
    is_featured: boolean;
    location_scope: string[];
    department_scope: string[];
    position_scope: string[];
    user_scope: string[];
    is_recurring?: boolean;
    recurrence_type?: string;
    custom_days?: number[];
    notification_channels?: string[];
  };
  submitEndpoint?: string;
  redirectPath?: string;
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
  locationHelperText?: string;
  onSubmitted?: (payload?: {
    mode: "create" | "edit";
    announcement: {
      id: string;
      title: string;
      body: string;
      kind: string | null;
      is_featured: boolean;
      publish_at: string | null;
      created_at: string;
      expires_at: string | null;
      target_scope: {
        locations: string[];
        department_ids: string[];
        position_ids: string[];
        users: string[];
      };
      created_by: string | null;
      created_by_name?: string;
      is_recurring?: boolean;
      recurrence_type?: string;
      custom_days?: number[];
      notification_channels?: string[];
    };
  }) => void;
};

export function AnnouncementCreateModal({ onClose, branches, departments, positions, users, publisherName, mode = "create", initial, submitEndpoint, redirectPath = "/app/announcements", allowedLocationIds, lockLocationSelection, locationHelperText, onSubmitted }: AnnouncementCreateModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, { success: false, message: "" });
  const [isApiPending, setIsApiPending] = useState(false);
  const [notifySms, setNotifySms] = useState(Boolean(initial?.notification_channels?.includes("sms")));
  const [notifyEmail, setNotifyEmail] = useState(Boolean(initial?.notification_channels?.includes("email")));
  const [hasExpiry, setHasExpiry] = useState(Boolean(initial?.expires_at));
  const [isRecurring, setIsRecurring] = useState(Boolean(initial?.is_recurring));
  const [scopeValid, setScopeValid] = useState(true);

  useEffect(() => {
    if (submitEndpoint) return;
    if (state.message) {
      if (state.success) {
        toast.success(mode === "edit" ? "Aviso actualizado." : "Aviso publicado.");
        startTransition(() => {
          router.refresh();
          onSubmitted?.();
          if (onClose) onClose();
          router.push(redirectPath);
        });
      } else {
        toast.error("No se pudo guardar el aviso.");
      }
    }
  }, [mode, onClose, onSubmitted, redirectPath, router, state, submitEndpoint]);

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
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const kind = String(formData.get("kind") ?? "general").trim();
    const formAnnouncementId = String(formData.get("announcement_id") ?? "").trim();

    if (!title || !body) {
      toast.error("Poné un título y un mensaje.");
      return;
    }

      const payload = {
      announcementId: formAnnouncementId || undefined,
      title,
      body,
      kind,
      is_featured: String(formData.get("is_featured") ?? "") === "on",
      expires_at: String(formData.get("expires_at") ?? "").trim() || null,
      location_scope: formData.getAll("location_scope").map(String).filter(Boolean),
      department_scope: formData.getAll("department_scope").map(String).filter(Boolean),
      position_scope: formData.getAll("position_scope").map(String).filter(Boolean),
      user_scope: formData.getAll("user_scope").map(String).filter(Boolean),
      scope_mode: String(formData.get("scope_mode") ?? "").trim() || undefined,
      // Sin esto, el portal de empleado guardaba el aviso y no notificaba a
      // nadie: los canales se quedaban en el formulario.
      notify_channels: formData.getAll("notify_channel").map(String).filter(Boolean),
      is_recurring: String(formData.get("is_recurring") ?? "") === "on",
      recurrence_type: String(formData.get("recurrence_type") ?? "daily").trim() || "daily",
      custom_days: String(formData.get("custom_days") ?? "[]"),
    };

    setIsApiPending(true);
    try {
      const method = mode === "edit" ? "PATCH" : "POST";
      const response = await fetch(submitEndpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error("No se pudo guardar el aviso.");
      }

      toast.success(mode === "edit" ? "Aviso actualizado." : "Aviso publicado.");
      startTransition(() => {
        const announcementId = String(data.announcementId ?? formAnnouncementId).trim();
        onSubmitted?.({
          mode,
          announcement: {
            id: announcementId,
            title,
            body,
            kind,
            is_featured: payload.is_featured,
            publish_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            expires_at: payload.expires_at,
            target_scope: {
              locations: payload.location_scope,
              department_ids: payload.department_scope,
              position_ids: payload.position_scope,
              users: payload.user_scope,
            },
            created_by: typeof data.created_by === "string" ? data.created_by : null,
            created_by_name: publisherName,
            is_recurring: payload.is_recurring,
            recurrence_type: payload.recurrence_type,
            custom_days: JSON.parse(payload.custom_days) as number[],
            notification_channels: payload.notify_channels,
          },
        });
        if (onClose) onClose();
      });
    } catch {
      toast.error("No se pudo guardar el aviso.");
    } finally {
      setIsApiPending(false);
    }
  }

  const pending = submitEndpoint ? isApiPending : isPending;

  return (
    <ScopeModalDialog
      onClose={handleClose}
      overlayClassName="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5"
      panelClassName={SCOPE_MODAL_PANEL}
    >
        <ScopeModalHeader
          title={mode === "edit" ? "Editar aviso" : "Nuevo aviso"}
          subtitle={
            mode === "edit"
              ? "Los cambios se ven en el portal al guardar"
              : "Se publica en el portal y se notifica según el alcance"
          }
          onClose={handleClose}
        />

        <form
          action={submitEndpoint ? undefined : formAction}
          onSubmit={submitEndpoint ? handleApiSubmit : undefined}
          className={SCOPE_MODAL_FORM}
        >
          {mode === "edit" && initial ? <input type="hidden" name="announcement_id" value={initial.id} /> : null}
          <ScopeModalZones>
            <ScopeModalContent>
              <ScopeModalSection label="Contenido" />

              <ScopeModalField label="Tipo de aviso">
                <select name="kind" defaultValue={initial?.kind ?? "general"} className={SCOPE_MODAL_SELECT}>
                  <option value="general">General</option>
                  <option value="urgent">Urgente</option>
                  <option value="reminder">Recordatorio</option>
                  <option value="celebration">Celebración</option>
                </select>
              </ScopeModalField>

              <ScopeModalField label="Título">
                <input
                  name="title"
                  required
                  defaultValue={initial?.title ?? ""}
                  placeholder="ej. Reunión obligatoria"
                  data-testid="announcement-title-input"
                  data-modal-initial-focus
                  className={SCOPE_MODAL_INPUT}
                />
              </ScopeModalField>

              <ScopeModalField label="Mensaje">
                <textarea
                  name="body"
                  required
                  defaultValue={initial?.body ?? ""}
                  placeholder="Escribí el mensaje completo"
                  data-testid="announcement-body-textarea"
                  className={SCOPE_MODAL_TEXTAREA}
                />
              </ScopeModalField>

              <ScopeModalDivider />
              <ScopeModalSection label="Publicación" />

              <ScopeModalToggleRow
                label="Fijar arriba de la lista"
                name="is_featured"
                defaultChecked={Boolean(initial?.is_featured)}
              />

              <ScopeModalToggleRow
                label="Tiene caducidad"
                sub="Se oculta solo al vencer"
                checked={hasExpiry}
                onChange={setHasExpiry}
              />
              {hasExpiry ? (
                <input
                  name="expires_at"
                  type="date"
                  defaultValue={initial?.expires_at ? initial.expires_at.slice(0, 10) : ""}
                  className={SCOPE_MODAL_INPUT}
                />
              ) : null}

              <ScopeModalToggleRow
                label="Repetir"
                sub="Diario, semanal o a medida"
                name="is_recurring"
                value="on"
                checked={isRecurring}
                onChange={setIsRecurring}
              />
              {isRecurring ? (
                <RecurrenceSelector initialType={initial?.recurrence_type} initialDays={initial?.custom_days} />
              ) : null}

              {mode === "create" || isRecurring ? (
                <>
                  <ScopeModalToggleRow
                    label={mode === "edit" ? "Email en próximos repartos" : "Enviar también por email"}
                    sub="Solo a quien tenga email cargado"
                    checked={notifyEmail}
                    onChange={setNotifyEmail}
                  />
                  {SHOW_SMS_CHANNEL ? (
                    <ScopeModalToggleRow label="Enviar también por SMS" checked={notifySms} onChange={setNotifySms} />
                  ) : null}
                  {notifySms ? <input type="hidden" name="notify_channel" value="sms" /> : null}
                  {notifyEmail ? <input type="hidden" name="notify_channel" value="email" /> : null}
                  {/* En alta push va siempre. En edicion se conserva el contrato
                      historico del job sin agregar canales que no tenia. */}
                  {mode === "create" || !initial?.is_recurring || initial.notification_channels?.includes("push") ? (
                    <input type="hidden" name="notify_channel" value="push" />
                  ) : null}
                </>
              ) : null}
            </ScopeModalContent>

            <ScopeSelector
              namespace="announcement"
              branches={branches}
              departments={departments}
              positions={positions}
              users={users}
              locationInputName="location_scope"
              departmentInputName="department_scope"
              positionInputName="position_scope"
              userInputName="user_scope"
              modeInputName="scope_mode"
              question="¿Quién tiene que ver este aviso?"
              audienceLabel="Lo verán"
              onValidityChange={setScopeValid}
              initialLocations={initial?.location_scope ?? []}
              initialDepartments={initial?.department_scope ?? []}
              initialPositions={initial?.position_scope ?? []}
              initialUsers={initial?.user_scope ?? []}
              allowedLocationIds={allowedLocationIds}
              lockLocationSelection={lockLocationSelection}
              locationHelperText={locationHelperText}
            />
          </ScopeModalZones>

          <div className={SCOPE_MODAL_FOOTER}>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
            >
              Cancelar
            </button>
            <SubmitButton
              label={mode === "edit" ? "Guardar cambios" : "Publicar Aviso"}
              pendingLabel={mode === "edit" ? "Guardando..." : "Publicando..."}
              pending={pending}
              disabled={!scopeValid}
              className="px-5 py-2 text-sm font-bold"
              data-testid="announcement-submit-btn"
            />
          </div>
        </form>
    </ScopeModalDialog>
  );
}
