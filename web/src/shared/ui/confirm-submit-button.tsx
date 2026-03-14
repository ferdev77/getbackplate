"use client";

import { AlertTriangle } from "lucide-react";
import { useRef, useState } from "react";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
};

export function ConfirmSubmitButton({
  label,
  confirmTitle,
  confirmDescription,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  className,
  disabled,
  children,
}: ConfirmSubmitButtonProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function submitClosestForm() {
    const form = triggerRef.current?.closest("form");
    if (!form) return;

    setOpen(false);
    form.requestSubmit();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        {children || label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-[#e6ddd8] bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-start gap-3">
              <span className="mt-0.5 rounded-full border border-amber-200 bg-amber-50 p-2 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </span>
              <div>
                <p className="text-base font-semibold text-[#2b2622]">{confirmTitle}</p>
                <p className="mt-1 text-sm text-[#6a625d]">{confirmDescription}</p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-[#ddd3ce] bg-white px-3 py-1.5 text-sm text-[#4e4743] hover:bg-[#f8f3f1]"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={submitClosestForm}
                className="rounded-lg bg-[#b63a2f] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#8f2e26]"
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
