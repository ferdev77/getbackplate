"use client";

type ConfirmActionDialogProps = {
  title: string;
  description: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  busyLabel?: string;
};

const PANEL =
  "overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-[0_24px_70px_rgba(0,0,0,.18)]";
const CANCEL =
  "rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-bg)] px-4 py-2 text-sm font-semibold text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] disabled:opacity-60";
const PRIMARY =
  "rounded-lg border-[1.5px] border-[var(--gbp-accent)] bg-[var(--gbp-accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60";

/**
 * Non-destructive confirmation dialog — same shape as ConfirmDeleteDialog
 * but with a neutral/accent confirm button instead of the danger-red one,
 * for actions like "this move will change who can see this item".
 */
export function ConfirmActionDialog({
  title,
  description,
  busy,
  onCancel,
  onConfirm,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  busyLabel = "Procesando...",
}: ConfirmActionDialogProps) {
  return (
    <div
      className="fixed inset-0 z-[1050] grid place-items-center bg-black/45 p-4"
      onClick={() => !busy && onCancel()}
    >
      <div
        className={`w-full max-w-[440px] ${PANEL}`}
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
          <button type="button" disabled={busy} onClick={onConfirm} className={PRIMARY}>
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
