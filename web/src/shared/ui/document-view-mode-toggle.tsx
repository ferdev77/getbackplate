"use client";

import { Columns3, ListTree } from "lucide-react";

type Props = {
  viewMode: "tree" | "columns";
  onChange: (next: "tree" | "columns") => void;
  testIdPrefix: string;
};

export function DocumentViewModeToggle({ viewMode, onChange, testIdPrefix }: Props) {
  return (
    <div className="inline-flex h-[33px] items-center rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] p-0.5">
      <button
        type="button"
        onClick={() => onChange("tree")}
        data-testid={`${testIdPrefix}-tree`}
        aria-pressed={viewMode === "tree"}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${viewMode === "tree" ? "border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] shadow-sm" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)]"}`}
        title="Vista de Árbol"
      >
        <ListTree className="h-4.5 w-4.5" />
      </button>
      <button
        type="button"
        onClick={() => onChange("columns")}
        data-testid={`${testIdPrefix}-columns`}
        aria-pressed={viewMode === "columns"}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${viewMode === "columns" ? "border border-[color:color-mix(in_oklab,var(--gbp-accent)_35%,transparent)] bg-[var(--gbp-accent-glow)] text-[var(--gbp-accent)] shadow-sm" : "text-[var(--gbp-text2)] hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)]"}`}
        title="Vista de Columnas"
      >
        <Columns3 className="h-4.5 w-4.5" />
      </button>
    </div>
  );
}
