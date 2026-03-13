"use client";

import { useMemo, useState } from "react";

type ScopeSelectorProps = {
  namespace: string;
  branches: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  positions?: Array<{ id: string; department_id: string; name: string }>;
  users: Array<{ id: string; user_id: string | null; first_name: string; last_name: string; role_label?: string }>;
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
    if (!q) return users;
    return users.filter((user) => `${user.first_name} ${user.last_name}`.toLowerCase().includes(q));
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
      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Acceso por locacion</label>
      <div className="rounded-lg border border-[#e8e8e8] bg-[#f8f8f8] p-3">
        <label className="mb-2 inline-flex items-center gap-2 border-b border-[#e4e4e4] pb-2 text-xs font-semibold text-[#111]">
          <input
            type="checkbox"
            checked={selectedLocations.size === branches.length && branches.length > 0}
            onChange={(event) => {
              const checked = event.target.checked;
              setSelectedLocations(checked ? new Set(branches.map((branch) => branch.id)) : new Set());
            }}
            className="h-[14px] w-[14px] accent-[#c0392b]"
          />
          Todas las locaciones
        </label>
        <div className="grid grid-cols-2 gap-2 text-xs text-[#444]">
          {branches.map((branch) => (
            <label key={`${namespace}-loc-${branch.id}`} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectedLocations.has(branch.id)}
                onChange={(event) => toggleLocation(branch.id, event.target.checked)}
                className="h-[13px] w-[13px] accent-[#c0392b]"
              />
              {branch.name}
            </label>
          ))}
        </div>
      </div>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Acceso por departamento / puesto</label>
      <div className="rounded-lg border border-[#e8e8e8] bg-[#f8f8f8] p-3 text-xs text-[#444]">
        <label className="mb-2 inline-flex items-center gap-2 border-b border-[#e4e4e4] pb-2 text-xs font-semibold text-[#111]">
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
            className="h-[14px] w-[14px] accent-[#c0392b]"
          />
          Todos
        </label>
        <div className="space-y-2">
          {departments.map((department) => {
            const departmentPositions = positionsByDepartment.get(department.id) ?? [];

            return (
              <div key={`${namespace}-dept-group-${department.id}`} className="rounded-md border border-[#e9e3df] bg-white/75 px-2 py-2">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedDepartments.has(department.id)}
                    onChange={(event) => toggleDepartment(department.id, event.target.checked)}
                    className="h-[14px] w-[14px] accent-[#c0392b]"
                  />
                  <span className="text-[12px] font-bold text-[#333]">{department.name}</span>
                </label>

                {departmentPositions.length ? (
                  <div className="mt-2 space-y-1.5 border-l border-[#eee6e1] pl-5">
                    {departmentPositions.map((position) => (
                      <label key={`${namespace}-pos-${position.id}`} className="inline-flex items-center gap-2 text-[12px]">
                        <input
                          type="checkbox"
                          checked={selectedPositions.has(position.id)}
                          onChange={(event) => togglePosition(position.id, event.target.checked)}
                          className="h-[13px] w-[13px] accent-[#c0392b]"
                        />
                        {position.name}
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 pl-6 text-[11px] text-[#9a908a]">Sin puestos cargados</p>
                )}
              </div>
            );
          })}
        </div>
        {!departments.length ? <p className="text-[#8b817c]">No hay departamentos activos.</p> : null}
      </div>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[#aaa]">Acceso por usuario</label>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="w-full rounded-lg border border-[#e8e8e8] px-3 py-2 text-sm"
        placeholder="Buscar usuario..."
      />
      <div className="mt-2 max-h-36 overflow-y-auto rounded-lg border border-[#e8e8e8] bg-white p-3">
        <div className="grid gap-2 text-xs text-[#444]">
          {filteredUsers.map((user) => {
            if (!user.user_id) return null;
            const value = user.user_id;
            return (
              <label key={`${namespace}-usr-${user.id}`} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedUsers.has(value)}
                  onChange={(event) => toggleUser(value, event.target.checked)}
                className="h-[13px] w-[13px] accent-[#c0392b]"
              />
              <span>{user.first_name} {user.last_name}</span>
              {user.role_label ? <span className="rounded-full border border-[#e7ddd8] bg-[#faf6f4] px-1.5 py-0 text-[10px] text-[#8b817c]">{user.role_label}</span> : null}
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
              className="rounded-full border border-[#e0d7d2] bg-[#faf6f4] px-2 py-0.5 text-xs text-[#4f4843]"
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
