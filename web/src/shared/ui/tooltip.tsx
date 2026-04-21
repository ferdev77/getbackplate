import * as React from "react";

/**
 * Reusable Tooltip component.
 * Usage:
 * <button className="group relative ...">
 *   <Icon />
 *   <TooltipLabel label="Action name" />
 * </button>
 */
export function TooltipLabel({
  label,
  side = "top",
}: {
  label: React.ReactNode;
  side?: "top" | "right";
}) {
  const isRight = side === "right";
  return (
    <span
      className={`pointer-events-none absolute z-[100] whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold tracking-wide opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-all duration-200 bg-[var(--gbp-text)] text-[var(--gbp-bg)] ${
        isRight
          ? "left-full top-1/2 ml-2 -translate-y-1/2 group-hover/tooltip:ml-3 group-hover/tooltip:opacity-100"
          : "-top-1 left-1/2 -translate-x-1/2 -translate-y-full group-hover/tooltip:-top-2 group-hover/tooltip:opacity-100"
      }`}
    >
      {label}
      {isRight ? (
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-[var(--gbp-text)]" />
      ) : (
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[var(--gbp-text)]" />
      )}
    </span>
  );
}
