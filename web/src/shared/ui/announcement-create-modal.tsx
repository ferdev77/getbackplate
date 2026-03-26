"use client";

import Link from "next/link";
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

export function AnnouncementCreateModal({ branches, departments, positions, users, publisherName, mode = "create", initial }: AnnouncementCreateModalProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createAnnouncementAction, { success: false, message: "" });
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [notifySms, setNotifySms] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [hasExpiry, setHasExpiry] = useState(Boolean(initial?.expires_at));
  const [isRecurring, setIsRecurring] = useState(Boolean(initial?.is_recurring));

  useEffect(() => {
    if (state.message) {
      if (state.success) {
        toast.success(state.message);
        startTransition(() => {
          router.refresh();
          // Redirect to main list after success
          router.push("/app/announcements");
        });
      } else {
        toast.error(state.message);
      }
    }
  }, [state, router]);

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/45 p-5">
      <div className="max-h-[90vh] w-[540px] max-w-[95vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b-[1.5px] border-[#f0f0f0] px-6 py-5">
          <p className="font-serif text-[15px] font-bold text-[#111]">{mode === "edit" ? "Editar Aviso" : "Nuevo Aviso"}</p>
          <Link
            href="/app/announcements"
            className="grid h-8 w-8 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111]"
          >
            ✕
          </Link>
        </div>

        <form action={formAction}>
          {mode === "edit" && initial ? <input type="hidden" name="announcement_id" value={initial.id} /> : null}
          <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
            <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">Tipo de aviso</label>
            <select name="kind" defaultValue={initial?.kind ?? "general"} className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm text-[#111]">
              <option value="general">General</option>
              <option value="urgent">Urgente</option>
              <option value="reminder">Recordatorio</option>
              <option value="celebration">Celebracion</option>
            </select>

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">Publicado por</label>
            <input
              value={publisherName}
              readOnly
              className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f3f3f3] px-3 py-2 text-sm text-[#666]"
            />

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">Titulo del aviso</label>
              <input
                name="title"
                required
                defaultValue={initial?.title ?? ""}
                placeholder="ej. Reunion obligatoria"
              className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm text-[#111]"
            />

            <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">Mensaje</label>
              <textarea
                name="body"
                required
                rows={4}
                defaultValue={initial?.body ?? ""}
                placeholder="Escribe el mensaje completo"
              className="w-full resize-y rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm text-[#111]"
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
                <div className="my-4 h-px bg-[#f0f0f0]" />

                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#888]">Notificar tambien via</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setNotifyWhatsapp((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyWhatsapp
                        ? "border-[#c0392b] bg-[#fff5f3] text-[#c0392b]"
                        : "border-[#e8e8e8] bg-white text-[#666]"
                    }`}
                  >
                    <MessageSquare className="h-3.5 w-3.5" /> WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifySms((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifySms
                        ? "border-[#c0392b] bg-[#fff5f3] text-[#c0392b]"
                        : "border-[#e8e8e8] bg-white text-[#666]"
                    }`}
                  >
                    <Smartphone className="h-3.5 w-3.5" /> SMS
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotifyEmail((prev) => !prev)}
                    className={`inline-flex items-center gap-1.5 rounded-lg border-[1.5px] px-3 py-1.5 text-xs font-semibold ${
                      notifyEmail
                        ? "border-[#c0392b] bg-[#fff5f3] text-[#c0392b]"
                        : "border-[#e8e8e8] bg-white text-[#666]"
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

            <div className="my-4 h-px bg-[#f0f0f0]" />

            <div className="mb-2 flex items-center justify-between rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-[13px] text-[#333]">
                <Pin className="h-3.5 w-3.5 text-[#555]" /> Fijar aviso arriba de la lista
              </div>
              <label className="relative inline-flex h-[22px] w-[38px] cursor-pointer items-center">
                <input type="checkbox" name="is_featured" defaultChecked={Boolean(initial?.is_featured)} className="peer sr-only" />
                <span className="absolute inset-0 rounded-[22px] bg-[#e0e0e0] transition peer-checked:bg-[#c0392b]" />
                <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>

            <div className="mb-0 flex items-center justify-between rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-[13px] text-[#333]">
                <Clock3 className="h-3.5 w-3.5 text-[#555]" /> Este aviso tiene caducidad
              </div>
              <label className="relative inline-flex h-[22px] w-[38px] cursor-pointer items-center">
                <input
                  type="checkbox"
                  checked={hasExpiry}
                  onChange={(event) => setHasExpiry(event.target.checked)}
                  className="peer sr-only"
                />
                <span className="absolute inset-0 rounded-[22px] bg-[#e0e0e0] transition peer-checked:bg-[#c0392b]" />
                <span className="absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-4" />
              </label>
            </div>
            {hasExpiry ? (
              <div className="mt-2">
                <input
                  name="expires_at"
                  type="date"
                  defaultValue={initial?.expires_at ? initial.expires_at.slice(0, 10) : ""}
                  className="w-full rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2 text-sm"
                />
              </div>
            ) : null}

            <div className="mt-3 mb-0 flex items-center justify-between rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f8f8f8] px-3 py-2.5">
              <div className="inline-flex items-center gap-2 text-[13px] text-[#333]">
                <Clock3 className="h-3.5 w-3.5 text-[#555]" /> Enviar periódicamente
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
                <span className="absolute inset-0 rounded-[22px] bg-[#e0e0e0] transition peer-checked:bg-[#c0392b]" />
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

          <div className="flex justify-end gap-2 border-t-[1.5px] border-[#f0f0f0] px-6 py-4">
            <Link
              href="/app/announcements"
              className="rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] hover:text-[#333]"
            >
              Cancelar
            </Link>
            <SubmitButton
              label={mode === "edit" ? "Guardar cambios" : "Publicar Aviso"}
              pendingLabel={mode === "edit" ? "Guardando..." : "Publicando..."}
              pending={isPending}
              className="px-5 py-2 text-sm font-bold"
            />
          </div>
        </form>
      </div>
    </div>
  );
}
