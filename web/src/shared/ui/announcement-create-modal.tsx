"use client";

import { MessageSquare, Pin, Smartphone, Clock3, Mail } from "lucide-react";
import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createAnnouncementAction } from "@/modules/announcements/actions";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";
import { RecurrenceSelector } from "@/shared/ui/recurrence-selector";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";

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
    };
  }) => void;
};

export function AnnouncementCreateModal({ onClose, branches, departments, positions, users, publisherName, mode = "create", initial, submitEndpoint, redirectPath = "/app/announcements", allowedLocationIds, lockLocationSelection, locationHelperText, onSubmitted }: AnnouncementCreateModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, { success: false, message: "" });
  const [isApiPending, setIsApiPending] = useState(false);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(Boolean(initial?.expires_at));
  const [isRecurring, setIsRecurring] = useState(Boolean(initial?.is_recurring));

  useEffect(() => {
    if (submitEndpoint) return;
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        startTransition(() => {
          router.refresh();
          onSubmitted?.();
          if (onClose) onClose();
          router.push(redirectPath);
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
    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();
    const kind = String(formData.get("kind") ?? "general").trim();
    const formAnnouncementId = String(formData.get("announcement_id") ?? "").trim();

    if (!title || !body) {
      toast.error("Titulo y contenido son obligatorios");
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
        throw new Error(typeof data.error === "string" ? data.error : "No se pudo guardar el aviso");
      }

      toast.success(mode === "edit" ? "Aviso actualizado correctamente" : "Aviso creado correctamente");
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
          },
        });
        if (onClose) onClose();
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el aviso");
    } finally {
      setIsApiPending(false);
    }
  }

  const pending = submitEndpoint ? isApiPending : isPending;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[675px] max-w-[95vw] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-sm font-bold text-[var(--gbp-text)]">{mode === "edit" ? "Editar Aviso" : "Nuevo Aviso"}</p>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          >
            ✕
          </button>
        </div>

        <form action={submitEndpoint ? undefined : formAction} onSubmit={submitEndpoint ? handleApiSubmit : undefined}>
          {mode === "edit" && initial ? <input type="hidden" name="announcement_id" value={initial.id} /> : null}
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Tipo de aviso</label>
            <select name="kind" defaultValue={initial?.kind ?? "general"} className="w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]">
              <option value="general">General</option>
              <option value="urgent">Urgente</option>
              <option value="reminder">Recordatorio</option>
              <option value="celebration">Celebracion</option>
            </select>

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Publicado por</label>
            <input
              value={publisherName}
              readOnly
              className="w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-3 py-2 text-sm text-[var(--gbp-text2)]"
            />

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Titulo del aviso</label>
              <input
                name="title"
                required
                defaultValue={initial?.title ?? ""}
                placeholder="ej. Reunion obligatoria"
                data-testid="announcement-title-input"
              className="w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]"
            />

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Mensaje</label>
              <textarea
                name="body"
                required
                rows={4}
                defaultValue={initial?.body ?? ""}
                placeholder="Escribe el mensaje completo"
                data-testid="announcement-body-textarea"
              className="w-full resize-y rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]"
            />

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
              initialLocations={initial?.location_scope ?? []}
              initialDepartments={initial?.department_scope ?? []}
              initialPositions={initial?.position_scope ?? []}
              initialUsers={initial?.user_scope ?? []}
              allowedLocationIds={allowedLocationIds}
              lockLocationSelection={lockLocationSelection}
              locationHelperText={locationHelperText}
            />

            {mode === "create" ? (
              <>
                <div className="my-4 h-px bg-[var(--gbp-border)]" />

                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-text2)]">Notificar tambien via</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyWhatsapp((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyWhatsapp
                        ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                        : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifySms((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifySms
                        ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                        : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" /> SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyEmail((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyEmail
                        ? "border-[var(--gbp-accent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]"
                        : "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)]"
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

            <div className="my-4 h-px bg-[var(--gbp-border)]" />

            <div className="mb-2 flex items-center justify-between rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-sm text-[var(--gbp-text)]">
                <Pin className="h-3.5 w-3.5 text-[var(--gbp-text2)]" /> Fijar aviso arriba de la lista
              </div>
              <label className="relative inline-flex h-[22px] w-[38px] cursor-pointer items-center">
                <input type="checkbox" name="is_featured" defaultChecked={Boolean(initial?.is_featured)} className="peer sr-only" />
                <span className="absolute inset-0 rounded-[22px] bg-[var(--gbp-border2)] transition peer-checked:bg-[var(--gbp-accent)]" />
                <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>

            <div className="mb-0 flex items-center justify-between rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-sm text-[var(--gbp-text)]">
                <Clock3 className="h-3.5 w-3.5 text-[var(--gbp-text2)]" /> Este aviso tiene caducidad
              </div>
              <label className="relative inline-flex h-[22px] w-[38px] cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={hasExpiry}
                  onChange={(event) => setHasExpiry(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-[22px] bg-[var(--gbp-border2)] transition peer-checked:bg-[var(--gbp-accent)]" />
                <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>
            {hasExpiry ? (
              <div className="mt-2">
                <input
                  name="expires_at"
                  type="date"
                  defaultValue={initial?.expires_at ? initial.expires_at.slice(0, 10) : ""}
                  className="w-full rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2 text-sm text-[var(--gbp-text)]"
                />
              </div>
            ) : null}

            <div className="mb-0 mt-3 flex items-center justify-between rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-sm text-[var(--gbp-text)]">
                <Clock3 className="h-3.5 w-3.5 text-[var(--gbp-text2)]" /> Enviar periódicamente
              </div>
              <label className="relative inline-flex h-[22px] w-[38px] cursor-pointer items-center">
                <input
                  type="checkbox"
                  name="is_recurring"
                  checked={isRecurring}
                  onChange={(event) => setIsRecurring(event.target.checked)}
                  className="peer sr-only"
                  value="on"
                />
                <span className="absolute inset-0 rounded-[22px] bg-[var(--gbp-border2)] transition peer-checked:bg-[var(--gbp-accent)]" />
                <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>
            {isRecurring ? (
              <RecurrenceSelector 
                initialType={initial?.recurrence_type} 
                initialDays={initial?.custom_days} 
              />
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t-[1.5px] border-[var(--gbp-border)] px-6 py-4">
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
              className="px-5 py-2 text-sm font-bold"
              data-testid="announcement-submit-btn"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
