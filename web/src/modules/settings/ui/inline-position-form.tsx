"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import { useFormStatus } from "react-dom";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[var(--gbp-text)] px-4 py-2 text-[11px] font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-50"
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
        className="mt-2 inline-flex items-center gap-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
      >
        <Plus className="h-3.5 w-3.5" /> Agregar puesto
      </button>
    );
  }

  return (
    <div className="mt-3 w-full animate-in overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 shadow-sm fade-in slide-in-from-top-2">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-bold text-[var(--gbp-text)]">Nuevo puesto en {departmentName}</p>
        <button
          onClick={() => setOpen(false)}
          className="grid h-6 w-6 place-items-center rounded-md text-[var(--gbp-muted)] transition-colors hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]"
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
        <input name="name" required placeholder={`Ej: Analista`} className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)]" />
        <input name="description" placeholder="Descripción (opcional)" className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)] outline-none transition-all placeholder:text-[var(--gbp-muted)] focus:border-[var(--gbp-accent)] focus:ring-1 focus:ring-[var(--gbp-accent)]" />
        
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-[11px] font-semibold text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
          >
            Cancelar
          </button>
          <SubmitButton />
        </div>
      </form>
    </div>
  );
}
