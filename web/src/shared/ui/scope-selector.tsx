"use client";

import { useMemo, useState } from "react";

type ScopeSelectorProps = {
  namespace: string;
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  positions?: Array<{ id: string; department_id: string; name: string }>;
  users: Array<{
    id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
    role_label?: string;
    location_label?: string;
    department_label?: string;
    position_label?: string;
  }>;
  locationInputName: string;
  departmentInputName: string;
  positionInputName?: string;
  userInputName: string;
  initialLocations?: string[];
  initialDepartments?: string[];
  initialPositions?: string[];
  initialUsers?: string[];
};

export function ScopeSelector({
  namespace,
  branches,
  departments,
  positions = [],
  users,
  locationInputName,
  departmentInputName,
  positionInputName,
  userInputName,
  initialLocations = [],
  initialDepartments = [],
  initialPositions = [],
  initialUsers = [],
}: ScopeSelectorProps) {
  const departmentBadgeClass = "rounded-full border border-blue-500/30 bg-blue-500/10 px-1.5 py-0 text-[10px] font-medium text-blue-600 dark:text-blue-400";
  const positionBadgeClass = "rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-700 dark:text-emerald-400";

  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => new Set(initialLocations));
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(() => new Set(initialDepartments));
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(() => new Set(initialPositions));
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set(initialUsers));
  const [query, setQuery] = useState("");

  const allDepartments = useMemo(() => departments.map((department) => department.id), [departments]);
  const positionsByDepartment = useMemo(() => {
    const map = new Map<string, Array<{ id: string; department_id: string; name: string }>>();
    for (const position of positions) {
      const list = map.get(position.department_id) ?? [];
      list.push(position);
      map.set(position.department_id, list);
    }
    return map;
  }, [positions]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? users.filter((user) => `${user.first_name} ${user.last_name}`.toLowerCase().includes(q))
      : users;

    return [...base].sort((a, b) => {
      const aHasAccess = Boolean(a.user_id);
      const bHasAccess = Boolean(b.user_id);
      if (aHasAccess !== bHasAccess) return aHasAccess ? -1 : 1;

      const aName = `${a.first_name} ${a.last_name}`.trim().toLowerCase();
      const bName = `${b.first_name} ${b.last_name}`.trim().toLowerCase();
      return aName.localeCompare(bName, "es");
    });
  }, [query, users]);

  function toggleLocation(value: string, checked: boolean) {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function toggleDepartment(value: string, checked: boolean) {
    setSelectedDepartments((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });

    const departmentPositions = positionsByDepartment.get(value) ?? [];
    if (!departmentPositions.length) return;

    setSelectedPositions((prev) => {
      const next = new Set(prev);
      for (const position of departmentPositions) {
        if (checked) next.add(position.id);
        else next.delete(position.id);
      }
      return next;
    });
  }

  function toggleUser(value: string, checked: boolean) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function togglePosition(value: string, checked: boolean) {
    const position = positions.find((item) => item.id === value);
    if (!position) return;

    const departmentPositions = positionsByDepartment.get(position.department_id) ?? [];
    setSelectedPositions((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);

      setSelectedDepartments((prevDepartments) => {
        const nextDepartments = new Set(prevDepartments);
        if (!departmentPositions.length) return nextDepartments;

        const allChecked = departmentPositions.every((item) => next.has(item.id));
        if (allChecked) nextDepartments.add(position.department_id);
        else nextDepartments.delete(position.department_id);
        return nextDepartments;
      });

      return next;
    });
  }

  return (
    <>
      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Acceso por locacion</label>
      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
        <label className="mb-2 inline-flex items-center gap-2 border-b border-[var(--gbp-border)] pb-2 text-xs font-semibold text-[var(--gbp-text)]">
          <input
            type="checkbox"
            checked={selectedLocations.size === branches.length && branches.length > 0}
            onChange={(event) => {
              const checked = event.target.checked;
              setSelectedLocations(checked ? new Set(branches.map((branch) => branch.id)) : new Set());
            }}
            className="h-[14px] w-[14px] accent-[var(--gbp-accent)]"
          />
          Todas las locaciones
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--gbp-text2)]">
          {branches.map((branch) => (
            <label key={`${namespace}-loc-${branch.id}`} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedLocations.has(branch.id)}
                onChange={(event) => toggleLocation(branch.id, event.target.checked)}
                className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
              />
              {branch.name}
            </label>
          ))}
        </div>
      </div>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Acceso por departamento / puesto</label>
      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
        <label className="mb-2 inline-flex items-center gap-2 border-b border-[var(--gbp-border)] pb-2 text-xs font-semibold text-[var(--gbp-text)]">
          <input
            type="checkbox"
            checked={
              selectedDepartments.size === allDepartments.length &&
              selectedPositions.size === positions.length &&
              (allDepartments.length > 0 || positions.length > 0)
            }
            onChange={(event) => {
              const checked = event.target.checked;
              setSelectedDepartments(checked ? new Set(allDepartments) : new Set());
              setSelectedPositions(checked ? new Set(positions.map((position) => position.id)) : new Set());
            }}
            className="h-[14px] w-[14px] accent-[var(--gbp-accent)]"
          />
          Todos
        </label>
        <div className="space-y-2">
          {departments.map((department) => {
            const departmentPositions = positionsByDepartment.get(department.id) ?? [];

            return (
              <div key={`${namespace}-dept-group-${department.id}`} className="rounded-md border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedDepartments.has(department.id)}
                    onChange={(event) => toggleDepartment(department.id, event.target.checked)}
                    className="h-[14px] w-[14px] accent-[var(--gbp-accent)]"
                  />
                  <span className="text-[12px] font-bold text-[var(--gbp-text)]">{department.name}</span>
                </label>

                {departmentPositions.length ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-l border-[var(--gbp-border)] pl-5 py-1">
                    {departmentPositions.map((position) => (
                      <label key={`${namespace}-pos-${position.id}`} className="inline-flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={selectedPositions.has(position.id)}
                          onChange={(event) => togglePosition(position.id, event.target.checked)}
                          className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
                        />
                        {position.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 pl-6 text-[11px] text-[var(--gbp-muted)]">Sin puestos cargados</p>
                )}
              </div>
            );
          })}
        </div>
        {!departments.length ? <p className="text-[var(--gbp-text2)]">No hay departamentos activos.</p> : null}
      </div>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Acceso por usuario</label>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"
        placeholder="Buscar usuario..."
      />
      <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-3">
        <div className="grid gap-2.5 text-xs text-[var(--gbp-text2)]">
          {filteredUsers.map((user) => {
            const value = user.user_id;
            const disabled = !value;
            return (
            <label
              key={`${namespace}-usr-${user.id}`}
              className={`grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2.5 gap-y-1 rounded-md border border-transparent px-1 py-1.5 hover:border-[var(--gbp-border)] hover:bg-[var(--gbp-bg)] ${disabled ? "opacity-60" : ""}`}
            >
                <input
                  type="checkbox"
                  checked={value ? selectedUsers.has(value) : false}
                  onChange={(event) => {
                    if (!value) return;
                    toggleUser(value, event.target.checked);
                  }}
                  disabled={disabled}
                  className="mt-[2px] h-[13px] w-[13px] accent-[var(--gbp-accent)]"
                />
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-medium text-[var(--gbp-text)]">{user.first_name} {user.last_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {user.department_label ? <span className={departmentBadgeClass}>Departamento: {user.department_label}</span> : null}
                    {user.position_label ? <span className={positionBadgeClass}>Puesto: {user.position_label}</span> : null}
                    {disabled ? <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface2)] px-1.5 py-0 text-[10px] text-[var(--gbp-muted)]">Sin acceso</span> : null}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from(selectedUsers).map((value) => {
          const user = users.find((item) => item.user_id === value);
          if (!user) return null;
          return (
            <button
              key={`${namespace}-pill-${value}`}
              type="button"
              onClick={() => toggleUser(value, false)}
              className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-bg)] px-2 py-0.5 text-xs text-[var(--gbp-text2)]"
            >
              {user.first_name} {user.last_name} x
            </button>
          );
        })}
      </div>

      {Array.from(selectedLocations).map((value) => (
        <input key={`${namespace}-loc-input-${value}`} type="hidden" name={locationInputName} value={value} />
      ))}
      {Array.from(selectedDepartments).map((value) => (
        <input key={`${namespace}-dept-input-${value}`} type="hidden" name={departmentInputName} value={value} />
      ))}
      {positionInputName
        ? Array.from(selectedPositions).map((value) => (
            <input key={`${namespace}-pos-input-${value}`} type="hidden" name={positionInputName} value={value} />
          ))
        : null}
      {Array.from(selectedUsers).map((value) => (
        <input key={`${namespace}-usr-input-${value}`} type="hidden" name={userInputName} value={value} />
      ))}
    </>
  );
}
