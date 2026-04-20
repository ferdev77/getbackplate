"use client";

import type { ReactNode } from "react";

type Props = {
  viewMode: "assigned" | "created";
  onChange: (next: "assigned" | "created") => void;
  assignedLabel?: string;
  createdLabel?: string;
  assignedCount?: number;
  createdCount?: number;
  title?: string;
  variant?: "compact" | "header";
  headerAction?: ReactNode;
};

export function AssignedCreatedToggle({
  viewMode,
  onChange,
  assignedLabel = "Asignados a mi",
  createdLabel = "Creados por mi",
  assignedCount,
  createdCount,
  title,
  variant = "compact",
  headerAction,
}: Props) {
  const assignedText = assignedCount != null ? `${assignedLabel} (${assignedCount})` : assignedLabel;
  const createdText = createdCount != null ? `${createdLabel} (${createdCount})` : createdLabel;

  if (variant === "header") {
    return (
      <section className="mb-4">
        {title || headerAction ? (
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            {title ? <p className="text-[11px] font-bold tracking-[0.11em] uppercase text-[var(--gbp-text2)]">{title}</p> : <span />}
            {headerAction}
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onChange("assigned")}
            className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${viewMode === "assigned" ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"}`}
          >
            {assignedText}
          </button>
          <button
            type="button"
            onClick={() => onChange("created")}
            className={`rounded-full border px-3 py-1 text-sm font-semibold transition ${viewMode === "created" ? "border-[color:color-mix(in_oklab,var(--gbp-accent)_40%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)]" : "border-[var(--gbp-border)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)]"}`}
          >
            {createdText}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mb-4 inline-flex items-center rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-1">
      <button
        type="button"
        onClick={() => onChange("assigned")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === "assigned" ? "bg-[var(--gbp-bg)] text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"}`}
      >
        {assignedText}
      </button>
      <button
        type="button"
        onClick={() => onChange("created")}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${viewMode === "created" ? "bg-[var(--gbp-bg)] text-[var(--gbp-text)]" : "text-[var(--gbp-text2)]"}`}
      >
        {createdText}
      </button>
    </section>
  );
}
