import { describe, it, expect } from "vitest";
import { updateDepartmentPosition } from "../org-structure.service";

/**
 * `employees.position` guarda una copia del nombre del puesto en texto, y el
 * alcance por puesto la resuelve comparando por nombre. Si se renombra el
 * puesto sin actualizar la copia, esos empleados dejan de resolver a ningun
 * puesto y quedan fuera de todo alcance filtrado por puesto, sin error visible.
 */

type EmployeeRow = { id: string; position: string | null; department_id: string | null };

function buildSupabaseMock(options: {
  previous: { name: string; department_id: string | null } | null;
  employees: EmployeeRow[];
}) {
  const updates: Array<{ ids: string[]; position: string }> = [];
  let positionUpdated: Record<string, unknown> | null = null;

  const supabase = {
    from(table: string) {
      if (table === "department_positions") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: options.previous, error: null }),
              }),
            }),
          }),
          update: (payload: Record<string, unknown>) => ({
            eq: () => ({
              eq: async () => {
                positionUpdated = payload;
                return { error: null };
              },
            }),
          }),
        };
      }

      if (table === "employees") {
        return {
          select: () => ({
            eq: async () => ({ data: options.employees, error: null }),
          }),
          update: (payload: { position: string }) => ({
            in: async (_column: string, ids: string[]) => {
              updates.push({ ids, position: payload.position });
              return { error: null };
            },
          }),
        };
      }

      throw new Error(`tabla inesperada: ${table}`);
    },
  };

  return { supabase, updates, getPositionUpdate: () => positionUpdated };
}

type ServiceParams = Parameters<typeof updateDepartmentPosition>[0];

async function renameTo(newName: string, options: Parameters<typeof buildSupabaseMock>[0]) {
  const mock = buildSupabaseMock(options);
  const result = await updateDepartmentPosition({
    supabase: mock.supabase as unknown as ServiceParams["supabase"],
    organizationId: "org1",
    positionId: "pos1",
    name: newName,
    description: null,
  });
  return { result, ...mock };
}

describe("updateDepartmentPosition — sincroniza la copia del nombre en empleados", () => {
  it("actualiza a los empleados que tenian el nombre anterior", async () => {
    const { result, updates } = await renameTo("Server", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [
        { id: "e1", position: "Servers", department_id: "dep-foh" },
        { id: "e2", position: "Bartender", department_id: "dep-foh" },
      ],
    });

    expect(result.ok).toBe(true);
    expect(updates).toEqual([{ ids: ["e1"], position: "Server" }]);
  });

  it("ignora mayusculas y espacios sobrantes, igual que el matching de alcance", async () => {
    const { updates } = await renameTo("Server", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [{ id: "e1", position: "  servers  ", department_id: "dep-foh" }],
    });

    expect(updates).toEqual([{ ids: ["e1"], position: "Server" }]);
  });

  it("no toca empleados de otro departamento", async () => {
    const { updates } = await renameTo("Server", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [{ id: "e1", position: "Servers", department_id: "dep-boh" }],
    });

    expect(updates).toEqual([]);
  });

  it("alcanza a empleados sin departamento asignado", async () => {
    const { updates } = await renameTo("Server", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [{ id: "e1", position: "Servers", department_id: null }],
    });

    expect(updates).toEqual([{ ids: ["e1"], position: "Server" }]);
  });

  it("no hace nada cuando el nombre no cambia", async () => {
    const { updates } = await renameTo("Servers", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [{ id: "e1", position: "Servers", department_id: "dep-foh" }],
    });

    expect(updates).toEqual([]);
  });

  it("no hace nada cuando solo cambian mayusculas", async () => {
    const { updates } = await renameTo("SERVERS", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [{ id: "e1", position: "Servers", department_id: "dep-foh" }],
    });

    expect(updates).toEqual([]);
  });

  it("rechaza una actualizacion sin nombre", async () => {
    const { result, updates } = await renameTo("", {
      previous: { name: "Servers", department_id: "dep-foh" },
      employees: [],
    });

    expect(result.ok).toBe(false);
    expect(updates).toEqual([]);
  });
});
