import * as React from "react";

/**
 * Reusable Tooltip component.
 * Usage:
 * <button className="group relative ...">
 *   <Icon />
 *   <TooltipLabel label="Action name" />
 * </button>
 */
export function TooltipLabel({ label }: { label: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute -top-1 left-1/2 z-[100] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-bold tracking-wide opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-all duration-200 group-hover/tooltip:-top-2 group-hover/tooltip:opacity-100 bg-[var(--gbp-text)] text-[var(--gbp-bg)]">
      {label}
      <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[var(--gbp-text)]"></span>
    </span>
  );
}
