"use client";

type ConfirmDeleteDialogProps = {
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
};

const PANEL =
  "overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]";
const CANCEL =
  "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60";
const DANGER =
  "rounded-lg border-[1.5px] border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] px-4 py-2 text-sm font-bold text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] disabled:opacity-60";

export function ConfirmDeleteDialog({
  title,
  description,
  busy,
  onCancel,
  onConfirm,
  confirmLabel = "Eliminar",
  cancelLabel = "Cancelar",
}: ConfirmDeleteDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[1050] grid place-items-center bg-black/45 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className={`w-full max-w-[420px] ${PANEL}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--gbp-border)] px-6 py-4">
          <p className="font-serif text-lg font-bold text-[var(--gbp-text)]">
            {title}
          </p>
          <p className="mt-1 text-sm text-[var(--gbp-text2)]">
            {description}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--gbp-border)] px-6 py-4">
          <button type="button" disabled={busy} onClick={onCancel} className={CANCEL}>
            {cancelLabel}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className={DANGER}>
            {busy ? "Procesando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
