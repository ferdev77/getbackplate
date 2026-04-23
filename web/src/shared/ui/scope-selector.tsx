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
    branch_id?: string | null;
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
  allowedLocationIds?: string[];
  lockLocationSelection?: boolean;
  locationHelperText?: string;
};

function normalize(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

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
  allowedLocationIds,
  lockLocationSelection = false,
  locationHelperText,
}: ScopeSelectorProps) {
  const availableLocationIds = useMemo(() => {
    if (!allowedLocationIds || allowedLocationIds.length === 0) {
      return branches.map((branch) => branch.id);
    }
    const allowed = new Set(allowedLocationIds);
    return branches.map((branch) => branch.id).filter((id) => allowed.has(id));
  }, [allowedLocationIds, branches]);

  const availableBranches = useMemo(() => {
    const ids = new Set(availableLocationIds);
    return branches.filter((branch) => ids.has(branch.id));
  }, [availableLocationIds, branches]);

  const branchNameById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const departmentNameById = useMemo(() => new Map(departments.map((department) => [department.id, department.name])), [departments]);
  const positionNameById = useMemo(() => new Map(positions.map((position) => [position.id, position.name])), [positions]);

  const fallbackLocations = useMemo(() => {
    const initial = normalize(initialLocations);
    if (initial.length > 0) return initial;
    return lockLocationSelection ? availableLocationIds : [];
  }, [availableLocationIds, initialLocations, lockLocationSelection]);

  const usersWithAccess = useMemo(
    () => users.filter((user) => Boolean(user.user_id)),
    [users],
  );

  const allowedUserIdSet = useMemo(
    () => new Set(usersWithAccess.map((user) => user.user_id).filter(Boolean) as string[]),
    [usersWithAccess],
  );

  const sanitizedInitialUsers = useMemo(
    () => normalize(initialUsers).filter((userId) => allowedUserIdSet.has(userId)),
    [allowedUserIdSet, initialUsers],
  );

  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => new Set(fallbackLocations));
  const [selectedDepartments, setSelectedDepartments] = useState<Set<string>>(() => new Set(normalize(initialDepartments)));
  const [selectedPositions, setSelectedPositions] = useState<Set<string>>(() => new Set(normalize(initialPositions)));
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(() => new Set(sanitizedInitialUsers));
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

  const selectedLocationNames = useMemo(
    () => new Set(Array.from(selectedLocations).map((id) => branchNameById.get(id)).filter(Boolean)),
    [branchNameById, selectedLocations],
  );
  const selectedDepartmentNames = useMemo(
    () => new Set(Array.from(selectedDepartments).map((id) => departmentNameById.get(id)).filter(Boolean)),
    [departmentNameById, selectedDepartments],
  );
  const selectedPositionNames = useMemo(
    () => new Set(Array.from(selectedPositions).map((id) => positionNameById.get(id)).filter(Boolean)),
    [positionNameById, selectedPositions],
  );

  const usersReachedByFilters = useMemo(() => {
    return usersWithAccess.filter((user) => {
      const locationOk = selectedLocations.size === 0
        ? true
        : Boolean(user.location_label && selectedLocationNames.has(user.location_label));
      const departmentOk = selectedDepartments.size === 0
        ? true
        : Boolean(user.department_label && selectedDepartmentNames.has(user.department_label));
      const positionOk = selectedPositions.size === 0
        ? true
        : Boolean(user.position_label && selectedPositionNames.has(user.position_label));

      return locationOk && departmentOk && positionOk;
    });
  }, [selectedDepartments, selectedDepartmentNames, selectedLocations, selectedLocationNames, selectedPositions, selectedPositionNames, usersWithAccess]);

  const reachedUserIds = useMemo(
    () => new Set(usersReachedByFilters.map((user) => user.user_id).filter(Boolean) as string[]),
    [usersReachedByFilters],
  );

  const usersAddedByOverride = useMemo(
    () => usersWithAccess.filter((user) => user.user_id && selectedUsers.has(user.user_id)),
    [selectedUsers, usersWithAccess],
  );

  const filteredCandidates = useMemo(() => {
    const q = query.trim().toLowerCase();

    return usersWithAccess
      .filter((user) => {
        if (!user.user_id) return false;

        const searchable = [
          `${user.first_name} ${user.last_name}`,
          user.location_label ?? "",
          user.department_label ?? "",
          user.position_label ?? "",
        ]
          .join(" ")
          .toLowerCase();

        return !q || searchable.includes(q);
      })
      .sort((a, b) => {
        const aReached = Boolean(a.user_id && reachedUserIds.has(a.user_id));
        const bReached = Boolean(b.user_id && reachedUserIds.has(b.user_id));
        const aChecked = Boolean(a.user_id && (selectedUsers.has(a.user_id) || aReached));
        const bChecked = Boolean(b.user_id && (selectedUsers.has(b.user_id) || bReached));
        if (aChecked !== bChecked) return aChecked ? -1 : 1;
        const aName = `${a.first_name} ${a.last_name}`.trim().toLowerCase();
        const bName = `${b.first_name} ${b.last_name}`.trim().toLowerCase();
        return aName.localeCompare(bName, "es");
      });
  }, [query, reachedUserIds, selectedUsers, usersWithAccess]);

  function toggleLocation(value: string, checked: boolean) {
    if (lockLocationSelection) return;
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

  function toggleUser(value: string, checked: boolean) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  return (
    <>
      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Alcance base por locación</label>
      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
        {locationHelperText ? (
          <p className="mb-2 text-[11px] text-[var(--gbp-text2)]">{locationHelperText}</p>
        ) : null}
        {!lockLocationSelection ? (
          <label className="mb-2 inline-flex items-center gap-2 border-b border-[var(--gbp-border)] pb-2 text-xs font-semibold text-[var(--gbp-text)]">
            <input
              type="checkbox"
              checked={selectedLocations.size === availableBranches.length && availableBranches.length > 0}
              onChange={(event) => {
                const checked = event.target.checked;
                setSelectedLocations(checked ? new Set(availableBranches.map((branch) => branch.id)) : new Set());
              }}
              className="h-[14px] w-[14px] accent-[var(--gbp-accent)]"
            />
            Todas mis locaciones habilitadas
          </label>
        ) : null}
        <div className="grid grid-cols-2 gap-2 text-xs text-[var(--gbp-text2)]">
          {availableBranches.map((branch) => (
            <label key={`${namespace}-loc-${branch.id}`} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedLocations.has(branch.id)}
                onChange={(event) => toggleLocation(branch.id, event.target.checked)}
                disabled={lockLocationSelection}
                className="h-[13px] w-[13px] accent-[var(--gbp-accent)]"
              />
              {branch.name}
            </label>
          ))}
        </div>
      </div>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Filtros dentro del alcance (departamento / puesto)</label>
      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3 text-xs text-[var(--gbp-text2)]">
        <p className="mb-2 text-[11px] text-[var(--gbp-text2)]">
          Estos filtros reducen la audiencia dentro de las locaciones elegidas.
        </p>
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
                  <span className="text-xs font-bold text-[var(--gbp-text)]">{department.name}</span>
                </label>

                {departmentPositions.length ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 border-l border-[var(--gbp-border)] py-1 pl-5">
                    {departmentPositions.map((position) => (
                      <label key={`${namespace}-pos-${position.id}`} className="inline-flex items-center gap-2 text-xs">
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
      </div>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Usuarios agregados manualmente (suman alcance)</label>
      <div className="rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-bg)] p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--gbp-text2)]">
          <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-0.5">Por filtros: {usersReachedByFilters.length}</span>
          <span className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-0.5">Agregados: {usersAddedByOverride.length}</span>
          <span className="rounded-full border border-[color:color-mix(in_oklab,var(--gbp-accent)_30%,transparent)] bg-[var(--gbp-accent-glow)] px-2 py-0.5 text-[var(--gbp-accent)]">Total: {usersReachedByFilters.length + usersAddedByOverride.length}</span>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"
          placeholder="Agregar usuario (nombre, locación, departamento o puesto)"
        />
        <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--gbp-border)] bg-[var(--gbp-surface)] p-2">
          <div className="grid gap-1.5 text-xs text-[var(--gbp-text2)]">
            {filteredCandidates.map((user) => {
              if (!user.user_id) return null;
              const reachedByFilter = reachedUserIds.has(user.user_id);
              const isChecked = selectedUsers.has(user.user_id) || reachedByFilter;
              return (
                <label
                  key={`${namespace}-usr-${user.id}`}
                  className={`grid grid-cols-[14px_minmax(0,1fr)] items-start gap-x-2 gap-y-1 rounded-md border px-1 py-1.5 hover:bg-[var(--gbp-bg)] ${
                    isChecked
                      ? "border-emerald-300/40 bg-emerald-50/70"
                      : "border-transparent hover:border-[var(--gbp-border)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(event) => toggleUser(user.user_id!, event.target.checked)}
                    className="mt-[2px] h-[13px] w-[13px] accent-emerald-600"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-[var(--gbp-text)]">{user.first_name} {user.last_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-[var(--gbp-text2)]">
                      {[user.location_label, user.department_label, user.position_label].filter(Boolean).join(" · ") || "Sin datos de perfil"}
                    </p>
                    {reachedByFilter ? <p className="text-[10px] text-emerald-700">Alcanzado por filtros</p> : null}
                  </div>
                </label>
              );
            })}
            {filteredCandidates.length === 0 ? (
              <p className="px-1 py-2 text-[11px] text-[var(--gbp-text2)]">No hay coincidencias para agregar.</p>
            ) : null}
          </div>
        </div>

        {usersAddedByOverride.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {usersAddedByOverride.map((user) => {
              if (!user.user_id) return null;
              return (
                <button
                  key={`${namespace}-pill-${user.user_id}`}
                  type="button"
                  onClick={() => toggleUser(user.user_id!, false)}
                  className="rounded-full border border-[var(--gbp-border)] bg-[var(--gbp-surface)] px-2 py-0.5 text-xs text-[var(--gbp-text2)]"
                >
                  {user.first_name} {user.last_name} x
                </button>
              );
            })}
          </div>
        ) : null}
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
