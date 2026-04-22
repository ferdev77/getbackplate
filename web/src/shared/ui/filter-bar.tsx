"use client";

import { Search } from "lucide-react";

export type FilterBarOption = { id: string; label: string };

export type FilterBarFilter = {
  /** Unique key for React reconciliation */
  key: string;
  options: FilterBarOption[];
  value: string;
  onChange: (value: string) => void;
  /** Label shown as the first "all" option */
  allLabel: string;
  testId?: string;
};

type FilterBarProps = {
  query: string;
  onQueryChange: (value: string) => void;
  searchPlaceholder?: string;
  searchTestId?: string;
  /** Ordered list of select filters to render after the search input */
  filters?: FilterBarFilter[];
  /**
   * When true, the "Limpiar filtros" button is shown.
   * If omitted, it is inferred from whether query or any filter value is non-empty.
   */
  hasActiveFilters?: boolean;
  /** Called when the user clicks "Limpiar filtros". Button is hidden when undefined. */
  onClearFilters?: () => void;
  clearLabel?: string;
  className?: string;
};

export function FilterBar({
  query,
  onQueryChange,
  searchPlaceholder = "Buscar...",
  searchTestId,
  filters = [],
  hasActiveFilters,
  onClearFilters,
  clearLabel = "Limpiar filtros",
  className,
}: FilterBarProps) {
  const showClear =
    hasActiveFilters ?? (query.length > 0 || filters.some((f) => f.value !== ""));

  return (
    <section
      className={`mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3 ${className ?? ""}`}
    >
      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--gbp-muted)]" />
        <input
          data-testid={searchTestId}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="h-[34px] w-[220px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] pl-9 pr-3 text-xs"
          placeholder={searchPlaceholder}
        />
      </div>

      {/* Dynamic select filters */}
      {filters.map((filter) => (
        <select
          key={filter.key}
          data-testid={filter.testId}
          value={filter.value}
          onChange={(e) => filter.onChange(e.target.value)}
          className="h-[34px] rounded-lg border-[1.5px] border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-xs"
        >
          <option value="">{filter.allLabel}</option>
          {filter.options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      ))}

      {/* Clear button */}
      {showClear && onClearFilters ? (
        <button
          type="button"
          data-testid="filter-bar-clear"
          onClick={onClearFilters}
          className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface2)] px-3 text-xs font-semibold text-[var(--gbp-text2)] transition hover:bg-[var(--gbp-bg)] hover:text-[var(--gbp-text)]"
        >
          {clearLabel}
        </button>
      ) : null}
    </section>
  );
}
