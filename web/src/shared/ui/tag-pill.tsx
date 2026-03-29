import type { HTMLAttributes } from "react";

type TagPillVariant = "default" | "accent" | "violet" | "success";

type TagPillProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: TagPillVariant;
};

const variantClasses: Record<TagPillVariant, string> = {
  default: "border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] text-[var(--gbp-text2)]",
  accent:
    "border-[color:color-mix(in_oklab,var(--gbp-accent)_28%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]",
  violet:
    "border-[color:color-mix(in_oklab,var(--gbp-violet)_30%,transparent)] bg-[var(--gbp-violet-soft)] text-[var(--gbp-violet)]",
  success:
    "border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)]",
};

export function TagPill({ variant = "default", className, children, ...props }: TagPillProps) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-[var(--gbp-radius-pill)] border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em]",
        variantClasses[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    >
      {children}
    </span>
  );
}

export type { TagPillProps, TagPillVariant };
