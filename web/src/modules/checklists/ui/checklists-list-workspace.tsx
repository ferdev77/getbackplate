"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Eye, MapPin, Pencil, Trash2 } from "lucide-react";
import { FilterBar } from "@/shared/ui/filter-bar";
import { EmptyState } from "@/shared/ui/empty-state";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { ScopePillsOverflow } from "@/shared/ui/scope-pills-overflow";
import { ChecklistEditTrigger } from "@/modules/checklists/ui/checklist-edit-trigger";
import { SlideUp } from "@/shared/ui/animations";
import type { ScopeCatalogUser } from "@/shared/lib/scope-users-catalog";

// ─── Styling tokens (kept in sync with page.tsx) ────────────────────────────
const TEXT_STRONG = "text-[var(--gbp-text)]";
const TEXT_MUTED = "text-[var(--gbp-text2)]";
const CARD = "border-[var(--gbp-border)] bg-[var(--gbp-surface)]";
const CARD_SOFT = "border-[var(--gbp-border)] bg-[var(--gbp-bg)]";
const BTN_GHOST =
  "border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]";
const ACTION_BTN_NEUTRAL = `group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border ${BTN_GHOST}`;
const ACTION_BTN_PREVIEW =
  "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-success)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-success-soft)] [.theme-dark-pro_&]:text-[var(--gbp-success)]";
const ACTION_BTN_DANGER =
  "group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_16%,transparent)] [.theme-dark-pro_&]:border-[color:color-mix(in_oklab,var(--gbp-error)_45%,transparent)] [.theme-dark-pro_&]:bg-[var(--gbp-error-soft)] [.theme-dark-pro_&]:text-[var(--gbp-error)]";

// ─── Filter options ──────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { id: "opening", label: "Apertura" },
  { id: "closing", label: "Cierre" },
  { id: "prep", label: "Prep" },
  { id: "custom", label: "Custom" },
];

function typeLabel(type: string) {
  if (type === "opening") return "Apertura";
  if (type === "closing") return "Cierre";
  if (type === "prep") return "Prep";
  return "Custom";
}

// ─── Types ───────────────────────────────────────────────────────────────────
type ScopeRole = { name: string; type: "department" | "position" };
type SectionView = { id: string; name: string; items: string[] };

export type ChecklistTemplateRow = {
  id: string;
  name: string;
  checklist_type: string;
  is_active: boolean;
  branch_id: string | null;
  shift?: string;
  department?: string;
  department_id?: string;
  repeat_every?: string;
  target_scope: Record<string, string[]>;
  created_by: string | null;
  created_by_name: string;
  branchName: string;
  itemsCount: number;
  scopeLocationNames: string[];
  scopeRoles: ScopeRole[];
  templateSections: SectionView[];
  templateItems?: Array<{ label: string }>;
  scheduledJob?: { recurrence_type: string; custom_days: number[]; cron_expression?: string } | null;
};

type Branch = { id: string; name: string };
type Department = { id: string; name: string };
type Position = { id: string; department_id: string; name: string };

type ChecklistsListWorkspaceProps = {
  templates: ChecklistTemplateRow[];
  branches: Branch[];
  departments: Department[];
  positions: Position[];
  users: ScopeCatalogUser[];
  initialQuery: string;
  initialType: string;
  initialLocation: string;
};

// ─── Component ───────────────────────────────────────────────────────────────
export function ChecklistsListWorkspace({
  templates,
  branches,
  departments,
  positions,
  users,
  initialQuery,
  initialType,
  initialLocation,
}: ChecklistsListWorkspaceProps) {
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [locFilter, setLocFilter] = useState(initialLocation);

  // Normalize: strip accents, lowercase — mirrors documents-tree-workspace
  const normalize = (str: string) =>
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const normalizedQuery = normalize(query);

  const activeBranches = useMemo(() => {
    const branchIds = new Set<string>();
    templates.forEach((t) => {
      if (t.branch_id) branchIds.add(t.branch_id);
      if (Array.isArray(t.target_scope?.locations)) {
        t.target_scope.locations.forEach((id) => branchIds.add(id));
      }
    });

    return branches
      .filter((b) => branchIds.has(b.id))
      .map((b) => ({ id: b.id, label: b.name }));
  }, [templates, branches]);

  const filteredTemplates = templates.filter((row) => {
    const byQ = !normalizedQuery || normalize(row.name).includes(normalizedQuery);
    const byType = !typeFilter || row.checklist_type === typeFilter;
    const byLoc =
      !locFilter ||
      row.branch_id === locFilter ||
      (Array.isArray(row.target_scope?.locations) && row.target_scope.locations.includes(locFilter));
    return byQ && byType && byLoc;
  });

  const hasActiveFilters = Boolean(query || typeFilter || locFilter);

  return (
    <>
      <SlideUp delay={0.1}>
        <FilterBar
          query={query}
          onQueryChange={setQuery}
          searchPlaceholder="Buscar checklist..."
          searchTestId="checklists-search-input"
          filters={[
            {
              key: "type",
              options: TYPE_OPTIONS,
              value: typeFilter,
              onChange: setTypeFilter,
              allLabel: "Todos los tipos",
              testId: "checklists-filter-type",
            },
            {
              key: "location",
              options: activeBranches,
              value: locFilter,
              onChange: setLocFilter,
              allLabel: "Todas las locaciones",
              testId: "checklists-filter-location",
            },
          ]}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={() => {
            setQuery("");
            setTypeFilter("");
            setLocFilter("");
          }}
        />
      </SlideUp>

      <SlideUp delay={0.2}>
        <section className={`overflow-hidden rounded-xl border ${CARD}`}>
          {/* Column headers */}
          <div
            className={`grid grid-cols-[1fr_120px] md:grid-cols-[2fr_100px_90px_120px] lg:grid-cols-[minmax(220px,1.7fr)_80px_90px_110px_minmax(160px,1fr)_minmax(220px,1.35fr)_90px_120px] gap-x-4 border-b-[1.5px] px-4 py-2.5 text-[11px] font-bold tracking-[0.07em] uppercase ${CARD_SOFT} ${TEXT_MUTED}`}
          >
            <p>Checklist</p>
            <p className="hidden md:block">Tipo</p>
            <p className="hidden lg:block">Shift</p>
            <p className="hidden lg:block">Frecuencia</p>
            <p className="hidden lg:block">Locación</p>
            <p className="hidden lg:block">Deptos / Puestos</p>
            <p className="hidden md:block">Estado</p>
            <p>Acciones</p>
          </div>

          {/* Rows */}
          <div>
            {filteredTemplates.length > 0 ? (
              <div>
                {filteredTemplates.map((template) => (
                  <div key={template.id}>
                    <div className="grid grid-cols-[1fr_120px] md:grid-cols-[2fr_100px_90px_120px] lg:grid-cols-[minmax(220px,1.7fr)_80px_90px_110px_minmax(160px,1fr)_minmax(220px,1.35fr)_90px_120px] items-center gap-x-4 border-b border-[var(--gbp-border)] px-4 py-3">
                      <div>
                        <p className={`text-sm font-semibold ${TEXT_STRONG}`}>{template.name}</p>
                        {template.itemsCount !== null && (
                          <p className={`text-[11px] ${TEXT_MUTED}`}>{template.itemsCount} items</p>
                        )}
                      </div>
                      <p className={`hidden text-xs md:block ${TEXT_MUTED}`}>
                        {typeLabel(template.checklist_type)}
                      </p>
                      <p className={`hidden text-xs lg:block ${TEXT_MUTED}`}>
                        {template.shift || "-"}
                      </p>
                      <p className={`hidden text-[11px] lg:block ${TEXT_MUTED}`}>
                        {template.repeat_every || "-"}
                      </p>
                      <div className="hidden lg:flex flex-wrap items-center gap-1">
                        <ScopePillsOverflow
                          pills={template.scopeLocationNames.map((n) => ({
                            name: n,
                            type: "location" as const,
                          }))}
                          max={5}
                          variant="initials"
                          emptyLabel={
                            <span className={`inline-flex items-center gap-1 text-xs ${TEXT_MUTED}`}>
                              <MapPin className="h-3.5 w-3.5" />
                              Todas
                            </span>
                          }
                        />
                      </div>
                      <div className="hidden lg:flex flex-wrap items-center gap-1">
                        <ScopePillsOverflow
                          pills={template.scopeRoles.map((r) => ({ name: r.name, type: r.type }))}
                          max={5}
                          variant="initials"
                          emptyLabel={<span className={`text-xs ${TEXT_MUTED}`}>-</span>}
                        />
                      </div>
                      <span
                        className={`hidden md:inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] ${
                          template.is_active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-neutral-200 bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {template.is_active ? "Activa" : "Inactiva"}
                      </span>
                      <div className="flex gap-1">
                        <Link
                          href={`/app/checklists?preview=${template.id}`}
                          className={ACTION_BTN_PREVIEW}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          <TooltipLabel label="Vista previa" />
                        </Link>
                        <ChecklistEditTrigger
                          className={ACTION_BTN_NEUTRAL}
                          template={template}
                          branches={branches}
                          departments={departments}
                          positions={positions}
                          users={users}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <TooltipLabel label="Editar" />
                        </ChecklistEditTrigger>
                        <Link
                          href={`/app/checklists?delete=${template.id}`}
                          className={ACTION_BTN_DANGER}
                          data-testid="delete-checklist-btn"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <TooltipLabel label="Eliminar" />
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No hay checklists"
                description="No se encontraron checklists para los filtros seleccionados."
              />
            )}
          </div>
        </section>
      </SlideUp>
    </>
  );
}
