"use client";

import { useMemo, useState } from "react";
import { ClipboardCheck, Eye, Pencil, Trash2 } from "lucide-react";

import { ChecklistDeleteModal } from "@/modules/checklists/ui/checklist-delete-modal";
import { ChecklistEditTrigger } from "@/modules/checklists/ui/checklist-edit-trigger";
import type { BranchOption, DepartmentOption, PositionOption, ScopedUserOption } from "@/shared/contracts/scope-options";
import { TooltipLabel } from "@/shared/ui/tooltip";
import { ScopePillsOverflow } from "@/shared/ui/scope-pills-overflow";
import { FilterBar } from "@/shared/ui/filter-bar";

type CreatedTemplateRow = {
  id: string;
  name: string;
  items: string[];
  checklist_type?: string;
  shift?: string;
  repeat_every?: string;
  is_active?: boolean;
  target_scope?: Record<string, string[]>;
  templateSections?: Array<{ name: string; items: string[] }>;
  sent?: boolean;
  submissionStatus?: string | null;
  submittedAt?: string | null;
};

type Props = {
  mine: CreatedTemplateRow[];
  canEdit: boolean;
  canDelete: boolean;
  branches: BranchOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  users: ScopedUserOption[];
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
  locationHelperText?: string;
  onRefresh: () => void;
  onMineChange: (next: CreatedTemplateRow[]) => void;
  loadingTemplateId: string;
  onOpenTemplatePreview: (templateId: string) => void;
};

export function EmployeeChecklistCreatedSection({
  mine,
  canEdit,
  canDelete,
  branches,
  departments,
  positions,
  users,
  allowedLocationIds,
  lockLocationSelection,
  locationHelperText,
  onRefresh,
  onMineChange,
  loadingTemplateId,
  onOpenTemplatePreview,
}: Props) {
  const [deleteTemplate, setDeleteTemplate] = useState<CreatedTemplateRow | null>(null);

  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filteredMine = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter((row) => {
      const byQuery = !q || row.name.toLowerCase().includes(q);
      const byStatus = !statusFilter || (statusFilter === "active" ? row.is_active : !row.is_active);
      const byLocation = !locationFilter || (row.target_scope?.locations || []).includes(locationFilter) || (row.target_scope?.location_scope || []).includes(locationFilter);
      return byQuery && byStatus && byLocation;
    });
  }, [locationFilter, mine, query, statusFilter]);

  const branchNameById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const departmentNameById = useMemo(() => new Map(departments.map((department) => [department.id, department.name])), [departments]);
  const positionNameById = useMemo(() => new Map(positions.map((position) => [position.id, position.name])), [positions]);

  function typeLabel(type?: string) {
    if (type === "opening") return "Apertura";
    if (type === "closing") return "Cierre";
    if (type === "prep") return "Prep";
    return "Custom";
  }

  function parseScope(scope?: Record<string, string[]>) {
    const data = scope ?? {};

    const locations = Array.isArray(data.locations)
      ? data.locations
      : Array.isArray(data.location_scope)
        ? data.location_scope
        : [];

    const departmentIds = Array.isArray(data.department_ids)
      ? data.department_ids
      : Array.isArray(data.department_scope)
        ? data.department_scope
        : Array.isArray(data.departments)
          ? data.departments
          : [];

    const positionIds = Array.isArray(data.position_ids)
      ? data.position_ids
      : Array.isArray(data.position_scope)
        ? data.position_scope
        : Array.isArray(data.positions)
          ? data.positions
          : [];

    return {
      locations,
      departmentIds,
      positionIds,
    };
  }

  return (
    <section className="space-y-3">
      <FilterBar
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder="Buscar checklist..."
        searchTestId="employee-checklists-search"
        filters={[
          {
            key: "location",
            options: branches.map((b) => ({ id: b.id, label: b.name })),
            value: locationFilter,
            onChange: setLocationFilter,
            allLabel: "Todas las ubicaciones",
            testId: "employee-checklists-filter-location",
          },
          {
            key: "status",
            options: [
              { id: "active", label: "Activa" },
              { id: "inactive", label: "Inactiva" },
            ],
            value: statusFilter,
            onChange: setStatusFilter,
            allLabel: "Todos los estados",
            testId: "employee-checklists-filter-status",
          },
        ]}
        hasActiveFilters={Boolean(query || locationFilter || statusFilter)}
        onClearFilters={() => {
          setQuery("");
          setLocationFilter("");
          setStatusFilter("");
        }}
      />

      <section className="overflow-hidden rounded-xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)]">
        <div className="grid grid-cols-[1fr_120px] md:grid-cols-[2fr_100px_90px_120px] lg:grid-cols-[minmax(220px,1.7fr)_80px_90px_110px_minmax(160px,1fr)_minmax(220px,1.35fr)_90px_120px] gap-x-4 border-b-[1.5px] border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-4 py-2.5 text-[11px] font-bold tracking-[0.07em] uppercase text-[var(--gbp-muted)]">
          <p>Checklist</p><p className="hidden md:block">Tipo</p><p className="hidden lg:block">Shift</p><p className="hidden lg:block">Frecuencia</p><p className="hidden lg:block">Locación</p><p className="hidden lg:block">Deptos / Puestos</p><p className="hidden md:block">Estado</p><p>Acciones</p>
        </div>

        {filteredMine.length > 0 ? (
          <div>
            {filteredMine.map((row) => {
              const scope = parseScope(row.target_scope);
              const locationNames = scope.locations.map((id) => branchNameById.get(id) ?? id);
              const rolePills = [
                ...scope.departmentIds.map((id) => ({ name: departmentNameById.get(id) ?? id, type: "department" as const })),
                ...scope.positionIds.map((id) => ({ name: positionNameById.get(id) ?? id, type: "position" as const })),
              ];
              return (
                <div key={row.id} className="grid grid-cols-[1fr_120px] md:grid-cols-[2fr_100px_90px_120px] lg:grid-cols-[minmax(220px,1.7fr)_80px_90px_110px_minmax(160px,1fr)_minmax(220px,1.35fr)_90px_120px] items-center gap-x-4 border-b border-[var(--gbp-border)] px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2 text-[var(--gbp-text)]">
                      <ClipboardCheck className="h-4 w-4 shrink-0 text-[var(--gbp-accent)]" />
                      <p className="truncate text-sm font-semibold">{row.name}</p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-[var(--gbp-text2)]">{row.items.length} item(s)</p>
                  </div>

                  <p className="hidden text-xs md:block text-[var(--gbp-text2)]">{typeLabel(row.checklist_type)}</p>
                  <p className="hidden text-xs lg:block text-[var(--gbp-text2)]">{row.shift || "-"}</p>
                  <p className="hidden text-[11px] lg:block text-[var(--gbp-text2)]">{row.repeat_every || "-"}</p>

                  <div className="hidden lg:flex flex-wrap items-center gap-1">
                    <ScopePillsOverflow
                      pills={locationNames.map((name) => ({ name, type: "location" as const }))}
                      max={5}
                      variant="initials"
                      emptyLabel={<span className="text-xs text-[var(--gbp-text2)]">Todas</span>}
                    />
                  </div>

                  <div className="hidden lg:flex flex-wrap items-center gap-1">
                    <ScopePillsOverflow
                      pills={rolePills}
                      max={5}
                      variant="initials"
                      emptyLabel={<span className="text-xs text-[var(--gbp-text2)]">-</span>}
                    />
                  </div>

                  <span className={`hidden md:inline-flex w-fit rounded-full border px-2 py-0.5 text-[11px] ${row.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-neutral-200 bg-neutral-100 text-neutral-600"}`}>{row.is_active ? "Activa" : "Inactiva"}</span>

                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenTemplatePreview(row.id)}
                      disabled={loadingTemplateId === row.id}
                      className="group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-success)_35%,transparent)] bg-[var(--gbp-success-soft)] text-[var(--gbp-success)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-success)_18%,transparent)] disabled:opacity-70"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <TooltipLabel label={loadingTemplateId === row.id ? "Cargando..." : "Vista previa"} />
                    </button>

                    {canEdit ? (
                      <ChecklistEditTrigger
                        className="group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] text-[var(--gbp-text2)] transition-colors hover:bg-[var(--gbp-surface2)]"
                        template={{
                          id: row.id,
                          name: row.name,
                          checklist_type: row.checklist_type,
                          shift: row.shift,
                          repeat_every: row.repeat_every,
                          is_active: row.is_active,
                          target_scope: row.target_scope,
                          templateSections: row.templateSections?.length ? row.templateSections : [{ name: "General", items: row.items }],
                          templateItems: row.items.map((item) => ({ label: item })),
                        }}
                        branches={branches}
                        departments={departments}
                        positions={positions}
                        users={users}
                        submitEndpoint="/api/employee/checklists/templates"
                        basePath="/portal/checklist"
                        allowedLocationIds={allowedLocationIds}
                        lockLocationSelection={lockLocationSelection}
                        locationHelperText={locationHelperText}
                        onSubmitted={onRefresh}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <TooltipLabel label="Editar" />
                      </ChecklistEditTrigger>
                    ) : null}

                    {canDelete ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTemplate(row)}
                        className="group/tooltip relative inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color:color-mix(in_oklab,var(--gbp-error)_35%,transparent)] bg-[var(--gbp-error-soft)] text-[var(--gbp-error)] transition-colors hover:bg-[color:color-mix(in_oklab,var(--gbp-error)_18%,transparent)]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <TooltipLabel label="Eliminar" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-8 text-center text-sm text-[var(--gbp-text2)]">Aún no creaste checklists.</div>
        )}
      </section>

      {deleteTemplate ? (
        <ChecklistDeleteModal
          template={{ id: deleteTemplate.id, name: deleteTemplate.name }}
          submitEndpoint="/api/employee/checklists/templates"
          redirectPath="/portal/checklist"
          onSubmitted={() => {
            onMineChange(mine.filter((row) => row.id !== deleteTemplate.id));
            setDeleteTemplate(null);
          }}
        />
      ) : null}
    </section>
  );
}
