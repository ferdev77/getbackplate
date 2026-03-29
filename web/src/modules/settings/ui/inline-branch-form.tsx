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
      className="rounded-lg bg-[#111] px-4 py-2 text-xs font-bold text-white hover:bg-[#c0392b] disabled:opacity-50 [.theme-dark-pro_&]:bg-[#2b5ea8] [.theme-dark-pro_&]:hover:bg-[#3a73c6]"
    >
      {pending ? "Guardando..." : "Guardar locación"}
    </button>
  );
}

export function InlineBranchForm({
  createAction,
}: {
  createAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 rounded-lg border border-[#ddd5d0] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#514b47] hover:bg-[#f7f3f1] transition-colors ${DARK_BTN_GHOST}`}
      >
        <Plus className="h-3.5 w-3.5" /> Agregar
      </button>
    );
  }

  return (
    <div className={`mt-3 mb-4 w-full rounded-xl border border-[#e8dfda] bg-[#fffdfa] p-4 shadow-sm animate-in fade-in slide-in-from-top-2 overflow-hidden ${DARK_CARD_SOFT}`}>
      <div className="mb-3 flex items-center justify-between">
        <p className={`text-sm font-bold text-[#201a17] ${DARK_TEXT_STRONG}`}>Nueva Locación</p>
        <button
          onClick={() => setOpen(false)}
          className="grid h-7 w-7 place-items-center rounded-md text-[#bbb] hover:bg-[#f5f5f5] hover:text-[#111] transition-colors [.theme-dark-pro_&]:text-[#8ea1bc] [.theme-dark-pro_&]:hover:bg-[#1c2635] [.theme-dark-pro_&]:hover:text-[#e7edf7]"
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
        className="grid gap-3 sm:grid-cols-2"
      >
        <input name="name" required placeholder="Nombre de locación" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        <input name="city" placeholder="Ciudad (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        <input name="state" placeholder="Provincia / Estado (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        <input name="country" placeholder="País (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        <input name="phone" placeholder="Teléfono (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all sm:col-span-2 ${DARK_INPUT}`} />
        <input name="address" placeholder="Dirección completa (opcional)" className={`rounded-lg border border-[#ddd3ce] px-3 py-2 text-sm sm:col-span-2 focus:border-brand focus:ring-1 focus:ring-brand outline-none transition-all ${DARK_INPUT}`} />
        
        <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`rounded-lg border border-[#ddd5d0] bg-white px-4 py-2 text-xs font-semibold text-[#514b47] hover:bg-[#f7f3f1] transition-colors ${DARK_BTN_GHOST}`}
          >
            Cancelar
          </button>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
