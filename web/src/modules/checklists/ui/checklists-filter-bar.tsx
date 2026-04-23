"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { FilterBar } from "@/shared/ui/filter-bar";

type Branch = { id: string; name: string };

type ChecklistsFilterBarProps = {
  branches: Branch[];
  /** Values read from URL searchParams on the server; used as fallback before client hydration */
  initialQuery: string;
  initialType: string;
  initialLocation: string;
};

const TYPE_OPTIONS = [
  { id: "opening", label: "Apertura" },
  { id: "closing", label: "Cierre" },
  { id: "prep", label: "Prep" },
  { id: "custom", label: "Custom" },
];

const DEBOUNCE_MS = 350;

export function ChecklistsFilterBar({
  branches,
  initialQuery,
  initialType,
  initialLocation,
}: ChecklistsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const typeFilter = searchParams.get("type") ?? initialType;
  const locFilter = searchParams.get("loc") ?? initialLocation;

  // Local state for the search input — keeps the field responsive on every keystroke
  const [localQuery, setLocalQuery] = useState(searchParams.get("q") ?? initialQuery);

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      }
      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  // When the user types, update local state immediately (no lag)
  // and debounce the actual URL navigation
  const handleQueryChange = useCallback(
    (value: string) => {
      setLocalQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        navigate({ q: value });
      }, DEBOUNCE_MS);
    },
    [navigate],
  );

  // Sync local state if URL param changes externally (e.g. browser back/forward)
  useEffect(() => {
    const urlQuery = searchParams.get("q") ?? "";
    setLocalQuery(urlQuery);
  }, [searchParams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const hasActiveFilters = Boolean(localQuery || typeFilter || locFilter);

  return (
    <FilterBar
      query={localQuery}
      onQueryChange={handleQueryChange}
      searchPlaceholder="Buscar checklist..."
      searchTestId="checklists-search-input"
      filters={[
        {
          key: "type",
          options: TYPE_OPTIONS,
          value: typeFilter,
          onChange: (value) => navigate({ type: value }),
          allLabel: "Todos los tipos",
          testId: "checklists-filter-type",
        },
        {
          key: "location",
          options: branches.map((b) => ({ id: b.id, label: b.name })),
          value: locFilter,
          onChange: (value) => navigate({ loc: value }),
          allLabel: "Todas las locaciones",
          testId: "checklists-filter-location",
        },
      ]}
      hasActiveFilters={hasActiveFilters}
      onClearFilters={() => {
        setLocalQuery("");
        if (debounceRef.current) clearTimeout(debounceRef.current);
        navigate({ q: "", type: "", loc: "" });
      }}
    />
  );
}
