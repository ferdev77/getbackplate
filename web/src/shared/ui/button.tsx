"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "ghost" | "outline" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--gbp-accent)] text-white shadow-[var(--gbp-shadow-accent)] hover:bg-[var(--gbp-accent-hover)]",
  ghost:
    "border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)] hover:text-[var(--gbp-text)]",
  outline:
    "border border-[color:color-mix(in_oklab,var(--gbp-violet)_28%,transparent)] bg-transparent text-[var(--gbp-violet)] hover:bg-[var(--gbp-violet-soft)]",
  danger:
    "bg-[var(--gbp-error)] text-white hover:brightness-95",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-[var(--gbp-radius-md)] px-3 text-xs font-semibold",
  md: "h-10 rounded-[var(--gbp-radius-lg)] px-4 text-sm font-semibold",
  lg: "h-11 rounded-[var(--gbp-radius-xl)] px-5 text-sm font-semibold",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        "inline-flex items-center justify-center gap-2 transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
});

export type { ButtonProps, ButtonVariant, ButtonSize };
