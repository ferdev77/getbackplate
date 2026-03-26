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
  "overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,.18)] [.theme-dark-pro_&]:border [.theme-dark-pro_&]:border-[#2b3646] [.theme-dark-pro_&]:bg-[#151b25]";
const CANCEL =
  "rounded-lg border-[1.5px] border-[#e8e8e8] bg-[#f5f5f5] px-4 py-2 text-sm font-semibold text-[#777] hover:bg-[#ececec] disabled:opacity-60 [.theme-dark-pro_&]:border-[#334155] [.theme-dark-pro_&]:bg-[#0f1723] [.theme-dark-pro_&]:text-[#c8d7ea] [.theme-dark-pro_&]:hover:bg-[#172131]";
const DANGER =
  "rounded-lg border-[1.5px] border-[#f3cbc4] bg-[#fff3f1] px-4 py-2 text-sm font-bold text-[#b63a2f] hover:bg-[#ffe8e4] disabled:opacity-60 [.theme-dark-pro_&]:border-[#6a3a42] [.theme-dark-pro_&]:bg-[#2a1c1f] [.theme-dark-pro_&]:text-[#ff9ea7] [.theme-dark-pro_&]:hover:bg-[#352328]";

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
        <div className="border-b border-[#f0f0f0] px-6 py-4 [.theme-dark-pro_&]:border-[#2b3646]">
          <p className="font-serif text-[18px] font-bold text-[#111] [.theme-dark-pro_&]:text-[#e7edf7]">
            {title}
          </p>
          <p className="mt-1 text-sm text-[#777] [.theme-dark-pro_&]:text-[#9aabc3]">
            {description}
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-[#f0f0f0] px-6 py-4 [.theme-dark-pro_&]:border-[#2b3646]">
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
