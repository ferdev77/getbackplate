"use client";

import { MessageSquare, Pin, Smartphone, Clock3, Mail } from "lucide-react";
import { useActionState, useEffect, useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createAnnouncementAction } from "@/modules/announcements/actions";
import { ScopeSelector } from "@/shared/ui/scope-selector";
import { SubmitButton } from "@/shared/ui/submit-button";
import { RecurrenceSelector } from "@/shared/ui/recurrence-selector";

type BranchOption = {
  id: string;
  name: string;
};

type DepartmentOption = {
  id: string;
  name: string;
};

type PositionOption = {
  id: string;
  department_id: string;
  name: string;
};

type UserOption = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  role_label?: string;
  location_label?: string;
  department_label?: string;
  position_label?: string;
};

type AnnouncementCreateModalProps = {
  onClose?: () => void;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: UserOption[];
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
};

export function AnnouncementCreateModal({ onClose, branches, departments, positions, users, publisherName, mode = "create", initial }: AnnouncementCreateModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, { success: false, message: "" });
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [hasExpiry, setHasExpiry] = useState(Boolean(initial?.expires_at));
  const [isRecurring, setIsRecurring] = useState(Boolean(initial?.is_recurring));

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        startTransition(() => {
          router.refresh();
          if (onClose) onClose();
          router.push("/app/announcements");
        });
      } else {
        toast.error(state.message);
      }
    }
  }, [state, router]);

  const handleClose = () => {
    if (onClose) {
      onClose();
      return;
    }
    router.push("/app/announcements");
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[675px] max-w-[95vw] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[var(--gbp-border)] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[var(--gbp-text)]">{mode === "edit" ? "Editar Aviso" : "Nuevo Aviso"}</p>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--gbp-muted)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
          >
            ✕
          </button>
        </div>

        <form action={formAction}>
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
              <div className="inline-flex items-center gap-2 text-[13px] text-[var(--gbp-text)]">
                <Pin className="h-3.5 w-3.5 text-[var(--gbp-text2)]" /> Fijar aviso arriba de la lista
              </div>
              <label className="relative inline-flex h-[22px] w-[38px] cursor-pointer items-center">
                <input type="checkbox" name="is_featured" defaultChecked={Boolean(initial?.is_featured)} className="peer sr-only" />
                <span className="absolute inset-0 rounded-[22px] bg-[var(--gbp-border2)] transition peer-checked:bg-[var(--gbp-accent)]" />
                <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>

            <div className="mb-0 flex items-center justify-between rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-[13px] text-[var(--gbp-text)]">
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
              <div className="inline-flex items-center gap-2 text-[13px] text-[var(--gbp-text)]">
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
              pending={isPending}
              className="px-5 py-2 text-sm font-bold"
              data-testid="announcement-submit-btn"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
