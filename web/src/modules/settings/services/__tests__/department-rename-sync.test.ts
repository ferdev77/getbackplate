import { describe, it, expect } from "vitest";
import { updateDepartment } from "../org-structure.service";

/**
 * employees.department y checklist_templates.department guardan una copia del
 * nombre ademas del department_id. El alcance se resuelve por el ID, asi que
 * renombrar no rompe el acceso; pero la copia se sigue mostrando en las listas
 * y quedaba vieja. Espeja el mismo arreglo hecho para el puesto.
 */

type UpdateCall = { table: string; payload: Record<string, unknown>; filters: Record<string, unknown> };

function buildSupabaseMock(options: { duplicate?: boolean; updateError?: string } = {}) {
  const updates: UpdateCall[] = [];

  function updateBuilder(table: string, payload: Record<string, unknown>) {
    const filters: Record<string, unknown> = {};
    const builder = {
      eq(column: string, value: unknown) {
        filters[column] = value;
        // organization_departments encadena dos .eq() y la ultima resuelve.
        if (table === "organization_departments" && Object.keys(filters).length === 2) {
          updates.push({ table, payload, filters });
          return Promise.resolve({ error: options.updateError ? { message: options.updateError } : null });
        }
        if (table !== "organization_departments" && Object.keys(filters).length === 2) {
          updates.push({ table, payload, filters });
          return Promise.resolve({ error: null });
        }
        return builder;
      },
    };
    return builder;
  }

  const supabase = {
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              neq: () => ({
                maybeSingle: async () => ({ data: options.duplicate ? { id: "otro" } : null, error: null }),
              }),
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => updateBuilder(table, payload),
      };
    },
  };

  return { supabase, updates };
}

type ServiceParams = Parameters<typeof updateDepartment>[0];

async function renameTo(name: string, options: Parameters<typeof buildSupabaseMock>[0] = {}) {
  const mock = buildSupabaseMock(options);
  const result = await updateDepartment({
    supabase: mock.supabase as unknown as ServiceParams["supabase"],
    organizationId: "org1",
    departmentId: "dep1",
    name,
    description: null,
  });
  return { result, updates: mock.updates };
}

describe("updateDepartment — sincroniza la copia del nombre", () => {
  it("actualiza el departamento, los empleados y los checklists", async () => {
    const { result, updates } = await renameTo("Cocina Central");

    expect(result.ok).toBe(true);
    const tablas = updates.map((u) => u.table);
    expect(tablas).toContain("organization_departments");
    expect(tablas).toContain("employees");
    expect(tablas).toContain("checklist_templates");
  });

  it("sincroniza por department_id, no por el nombre anterior", async () => {
    const { updates } = await renameTo("Cocina Central");

    const empleados = updates.find((u) => u.table === "employees");
    expect(empleados?.payload).toEqual({ department: "Cocina Central" });
    expect(empleados?.filters).toEqual({ organization_id: "org1", department_id: "dep1" });
  });

  it("no sincroniza nada si el update del departamento falla", async () => {
    const { result, updates } = await renameTo("Cocina Central", { updateError: "boom" });

    expect(result.ok).toBe(false);
    expect(updates.map((u) => u.table)).toEqual(["organization_departments"]);
  });

  it("rechaza un nombre duplicado sin tocar nada", async () => {
    const { result, updates } = await renameTo("Cocina Central", { duplicate: true });

    expect(result.ok).toBe(false);
    expect(updates).toEqual([]);
  });

  it("rechaza una actualizacion sin nombre", async () => {
    const { result, updates } = await renameTo("");

    expect(result.ok).toBe(false);
    expect(updates).toEqual([]);
  });
});
