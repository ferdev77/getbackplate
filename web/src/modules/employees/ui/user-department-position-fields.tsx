"use client";

import { useMemo, useState } from "react";

type Department = {
  id: string;
  name: string;
};

type Position = {
  id: string;
  department_id: string;
  name: string;
  is_active: boolean;
};

type UserDepartmentPositionFieldsProps = {
  departments: Department[];
  positions: Position[];
};

export function UserDepartmentPositionFields({ departments, positions }: UserDepartmentPositionFieldsProps) {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedPositionId, setSelectedPositionId] = useState("");

  const filteredPositions = useMemo(
    () => positions.filter((position) => position.department_id === selectedDepartmentId),
    [positions, selectedDepartmentId],
  );

  return (
    <>
      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Departamento</label>
      <select
        name="department_id"
        value={selectedDepartmentId}
        onChange={(event) => {
          const nextDepartmentId = event.target.value;
          setSelectedDepartmentId(nextDepartmentId);
          if (!positions.some((position) => position.department_id === nextDepartmentId && position.id === selectedPositionId)) {
            setSelectedPositionId("");
          }
        }}
        className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"
      >
        <option value="">Sin departamento</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>{department.name}</option>
        ))}
      </select>

      <label className="mb-1 mt-3 block text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--gbp-muted)]">Puesto del departamento</label>
      <select
        name="position_id"
        value={selectedPositionId}
        onChange={(event) => setSelectedPositionId(event.target.value)}
        className="w-full rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 py-2 text-sm text-[var(--gbp-text)]"
      >
        <option value="">Sin puesto</option>
        {filteredPositions.map((position) => (
          <option key={position.id} value={position.id}>{position.name}</option>
        ))}
      </select>
    </>
  );
}
