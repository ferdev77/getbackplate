import * as React from "react";
import { MapPin } from "lucide-react";
import { TooltipLabel } from "@/shared/ui/tooltip";

export type ScopePillType = "location" | "department" | "position" | "user";

export interface ScopePillItem {
  name: string;
  type?: ScopePillType;
}

export type ScopeOverflowVariant = "pills" | "initials";

const PILL_CLASSES: Record<ScopePillType, string> = {
  location:
    "inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-accent)]",
  department:
    "inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400",
  position:
    "inline-flex items-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--gbp-success)]",
  user: "inline-flex items-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-[10px] text-[var(--gbp-text2)]",
};

const INITIALS_CLASSES: Record<ScopePillType, string> = {
  location:
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[10px] font-bold text-[var(--gbp-accent)]",
  department:
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10 text-[10px] font-bold text-blue-600 dark:text-blue-400",
  position:
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[10px] font-bold text-[var(--gbp-success)]",
  user:
    "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] text-[10px] font-bold text-[var(--gbp-text2)]",
};

function initialsFromName(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return "--";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0].slice(0, 1)}${words[1].slice(0, 1)}`.toUpperCase();
}

/**
 * Shows up to `max` scope pills, then a "+N" badge with a CSS-only tooltip listing the rest.
 */
export function ScopePillsOverflow({
  pills,
  max = 4,
  emptyLabel,
  variant = "pills",
}: {
  pills: ScopePillItem[];
  max?: number;
  emptyLabel?: React.ReactNode;
  variant?: ScopeOverflowVariant;
}) {
  if (pills.length === 0) {
    return emptyLabel !== undefined ? <>{emptyLabel}</> : null;
  }

  const visiblePills = pills.slice(0, max);
  const overflowPills = pills.slice(max);

  if (variant === "initials") {
    return (
      <div className="inline-flex items-center -space-x-1">
        {visiblePills.map((pill, i) => {
          const type = pill.type ?? "department";
          return (
            <span key={i} className="group/tooltip relative inline-flex">
              <span
                title={pill.name}
                aria-label={pill.name}
                className={`${INITIALS_CLASSES[type]} ring-2 ring-[var(--gbp-surface)] transition-transform hover:z-10 hover:-translate-y-0.5`}
              >
                {initialsFromName(pill.name)}
              </span>
              <TooltipLabel label={pill.name} />
            </span>
          );
        })}
        {overflowPills.length > 0 && (
          <div className="group/overflow relative ml-1">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] text-[10px] font-bold text-[var(--gbp-text2)] ring-2 ring-[var(--gbp-surface)]"
              title={`${overflowPills.length} elementos ocultos`}
              aria-label={`${overflowPills.length} elementos ocultos`}
            >
              +{overflowPills.length}
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-lg bg-[var(--gbp-text)] px-3 py-2 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-opacity duration-200 group-hover/overflow:opacity-100 group-focus-within/overflow:opacity-100">
              <ul className="flex flex-col gap-0.5">
                {overflowPills.map((pill, i) => (
                  <li key={i} className="whitespace-nowrap text-[10px] leading-4 text-[var(--gbp-bg)]">
                    {pill.name}
                  </li>
                ))}
              </ul>
              <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[var(--gbp-text)]" />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {visiblePills.map((pill, i) => (
        <span key={i} className={PILL_CLASSES[pill.type ?? "department"]}>
          {pill.type === "location" && <MapPin className="mr-1 h-3 w-3" />}
          {pill.name}
        </span>
      ))}
      {overflowPills.length > 0 && (
        <div className="group/overflow relative">
          <span className="inline-flex cursor-default select-none items-center rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--gbp-text2)]">
            +{overflowPills.length}
          </span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-lg bg-[var(--gbp-text)] px-3 py-2 opacity-0 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-opacity duration-200 group-hover/overflow:opacity-100">
            <ul className="flex flex-col gap-0.5">
              {overflowPills.map((pill, i) => (
                <li key={i} className="whitespace-nowrap text-[10px] leading-4 text-[var(--gbp-bg)]">
                  {pill.name}
                </li>
              ))}
            </ul>
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-[5px] border-transparent border-t-[var(--gbp-text)]" />
          </div>
        </div>
      )}
    </div>
  );
}
