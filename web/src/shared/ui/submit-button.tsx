"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { AnimatedButton } from "@/shared/ui/animations";

type SubmitButtonProps = {
  label?: string;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
  variant?: "primary" | "danger" | "ghost";
  pending?: boolean;
  name?: string;
  value?: string;
  formNoValidate?: boolean;
};

const variantClasses: Record<NonNullable<SubmitButtonProps["variant"]>, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-dark disabled:opacity-60",
  danger:
    "bg-[#b63a2f] text-white hover:bg-[#8f2e26] disabled:opacity-60",
  ghost:
    "border border-[#ddd3ce] bg-white text-[#4e4743] hover:bg-[#f8f3f1] disabled:opacity-60",
};

export function SubmitButton({
  label = "Guardar",
  pendingLabel,
  className,
  disabled,
  variant = "primary",
  pending: externalPending,
  name,
  value,
  formNoValidate,
}: SubmitButtonProps) {
  const { pending: internalPending } = useFormStatus();
  const isPending = externalPending ?? internalPending ?? disabled;

  return (
    <AnimatedButton
      type="submit"
      disabled={isPending}
      aria-disabled={isPending}
      name={name}
      value={value}
      formNoValidate={formNoValidate}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition shadow-sm",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {(externalPending ?? internalPending) ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          {pendingLabel ?? label}
        </>
      ) : (
        label
      )}
    </AnimatedButton>
  );
}
