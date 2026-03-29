"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useFormStatus } from "react-dom";

const DARK_BTN_GHOST = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text2)] [.theme-dark-pro_&]:hover:bg-[var(--gbp-surface2)]";
const DARK_INPUT = "[.theme-dark-pro_&]:border-[var(--gbp-border2)] [.theme-dark-pro_&]:bg-[var(--gbp-surface)] [.theme-dark-pro_&]:text-[var(--gbp-text)] [.theme-dark-pro_&]:placeholder:text-[var(--gbp-muted)]";
const DARK_CARD_SOFT = "[.theme-dark-pro_&]:border-[var(--gbp-border)] [.theme-dark-pro_&]:bg-[var(--gbp-bg)]";
const DARK_TEXT_STRONG = "[.theme-dark-pro_&]:text-[var(--gbp-text)]";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#111] px-4 py-2 text-[11px] font-bold text-white hover:bg-[#c0392b] disabled:opacity-50 [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]"
    >
      {pending ? "Guardando..." : "Guardar puesto"}
    </button>
  );
}

export function InlinePositionForm({
  departmentId,
  departmentName,
  createAction,
}: {
  departmentId: string;
  departmentName: string;
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`mt-2 inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1] transition-colors ${DARK_BTN_GHOST}`}
      >
        <Plus className="h-3.5 w-3.5" /> Agregar puesto
      </button>
    );
  }

  return (
    <div className={`mt-3 w-full rounded-xl border border-[#e8dfda] bg-[#fffdfa] p-3 shadow-sm animate-in fade-in slide-in-from-top-2 overflow-hidden ${DARK_CARD_SOFT}`}>
      <div className="mb-2 flex items-center justify-between">
        <p className={`text-[12px] font-bold text-[#201a17] ${DARK_TEXT_STRONG}`}>Nuevo puesto en {departmentName}</p>
        <button
          onClick={() => setOpen(false)}
          className="grid h-6 w-6 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111] transition-colors [.theme-dark-pro_&]:text-[#8ea1bc] [.theme-dark-pro_&]:hover:bg-[#1c2635] [.theme-dark-pro_&]:hover:text-[#e7edf7]"
        >
          ✕
        </button>
      </div>
      <form
        ref={formRef}
        action={async (formData) => {
          await createAction(formData);
          setOpen(false);
          formRef.current?.reset();
        }}
        className="grid gap-2"
      >
        <input type="hidden" name="department_id" value={departmentId} />
        <input name="name" required placeholder={`Ej: Analista`} className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        <input name="description" placeholder="Descripción (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`rounded-lg border border-[#ddd5d0] bg-white px-3 py-2 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1] transition-colors ${DARK_BTN_GHOST}`}
          >
            Cancelar
          </button>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
