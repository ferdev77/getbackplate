"use client";

import { useState } from "react";

type Props = {
  title: string;
  initialValue: string;
  busy: boolean;
  onCancel: () => void;
  onSave: (nextTitle: string) => void;
};

export function EmployeeDocumentEditModal({
  title,
  initialValue,
  busy,
  onCancel,
  onSave,
}: Props) {
  const [nextTitle, setNextTitle] = useState(initialValue);

  return (
    <div className="fixed inset-0 z-[1050] grid place-items-center bg-black/45 p-4" onClick={() => !busy && onCancel()}>
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--gbp-border)] px-6 py-4">
          <p className="font-serif text-[18px] font-bold text-[var(--gbp-text)]">Editar documento</p>
          <p className="mt-1 text-sm text-[var(--gbp-text2)]">Actualiza el título de "{title}".</p>
        </div>
        <div className="px-6 py-4">
          <label className="grid gap-1.5">
            <span className="text-[11px] font-bold tracking-[0.1em] text-[var(--gbp-text2)] uppercase">Título</span>
            <input
              value={nextTitle}
              onChange={(event) => setNextTitle(event.target.value)}
              className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"
              autoFocus
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--gbp-border)] px-6 py-4">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy || !nextTitle.trim()}
            onClick={() => onSave(nextTitle.trim())}
            className="rounded-lg bg-[var(--gbp-text)] px-5 py-2 text-sm font-bold text-white hover:bg-[var(--gbp-accent)] disabled:opacity-60"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
