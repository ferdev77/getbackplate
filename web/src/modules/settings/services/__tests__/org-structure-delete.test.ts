import { describe, expect, it } from "vitest";

import {
  deleteBranch,
  deleteDepartment,
  deleteDepartmentPosition,
} from "../org-structure.service";

/**
 * Borrar una locacion, un departamento o un puesto.
 *
 * Esto estaba roto y no tenia test. Las tres funciones preguntaban si el
 * recurso estaba en uso mirando `memberships`, pero esa tabla no tiene
 * department_id ni position_id (verificado en dev y en prod). La consulta
 * fallaba, se caia en el manejo de error y borrar un puesto o un departamento
 * devolvia SIEMPRE "no se pudo verificar el uso", estuviera libre o no.
 *
 * Para locaciones la columna si existe, pero mirar solo `memberships.branch_id`
 * dejaba afuera dos casos reales: la locacion que alguien tiene entre sus
 * asignadas (location_scope_ids) y la del legajo de alguien sin cuenta. Se
 * podia borrar una locacion que seguia en uso.
 *
 * El dato vive en organization_user_profiles y employees; memberships solo
 * aporta locaciones.
 */

type Consulta = { tabla: string; columnas: string[]; filtros: string[] };

/** Supabase falso: anota que se consulto y responde lo que se le indique. */
function supabaseFalso(opciones: {
  /** Cuantas filas devuelve cada tabla. Lo que no este, devuelve 0. */
  conteos?: Record<string, number>;
  /** Tablas que no existen: consultarlas da error, como en la base real. */
  tablasQueFallan?: string[];
} = {}) {
  const consultas: Consulta[] = [];
  const conteos = opciones.conteos ?? {};
  const fallan = new Set(opciones.tablasQueFallan ?? []);

  const cliente = {
    from(tabla: string) {
      const registro: Consulta = { tabla, columnas: [], filtros: [] };

      const cadena = {
        select(columnas: string) {
          registro.columnas.push(columnas);
          return cadena;
        },
        eq(columna: string, valor: string) {
          registro.filtros.push(`${columna}=${valor}`);
          return cadena;
        },
        or(expresion: string) {
          registro.filtros.push(`or(${expresion})`);
          return cadena;
        },
        delete() {
          registro.filtros.push("DELETE");
          return cadena;
        },
        then(resolver: (r: unknown) => void) {
          consultas.push(registro);
          if (fallan.has(tabla)) {
            return resolver({ count: null, error: { message: `column does not exist on ${tabla}` } });
          }
          return resolver({ count: conteos[tabla] ?? 0, error: null });
        },
      };

      return cadena;
    },
  };

  return { cliente: cliente as never, consultas };
}

const BASE = { organizationId: "org-1" };

describe("no se consulta memberships por departamento ni por puesto", () => {
  it("borrar un puesto no toca memberships", async () => {
    // memberships no tiene position_id: preguntarle ahi rompia el borrado.
    const { cliente, consultas } = supabaseFalso({ tablasQueFallan: ["memberships"] });

    const resultado = await deleteDepartmentPosition({
      supabase: cliente,
      ...BASE,
      positionId: "pos-1",
    });

    expect(resultado.ok, "el borrado volvio a fallar en la verificacion de uso").toBe(true);
    expect(consultas.map((c) => c.tabla)).not.toContain("memberships");
  });

  it("borrar un departamento no toca memberships", async () => {
    const { cliente, consultas } = supabaseFalso({ tablasQueFallan: ["memberships"] });

    const resultado = await deleteDepartment({
      supabase: cliente,
      ...BASE,
      departmentId: "dep-1",
    });

    expect(resultado.ok).toBe(true);
    expect(consultas.map((c) => c.tabla)).not.toContain("memberships");
  });
});

describe("busca el uso donde el dato realmente vive", () => {
  it("un puesto se busca en perfiles y en legajos", async () => {
    const { cliente, consultas } = supabaseFalso();
    await deleteDepartmentPosition({ supabase: cliente, ...BASE, positionId: "pos-1" });

    const consultadas = consultas.filter((c) => c.filtros.includes("position_id=pos-1")).map((c) => c.tabla);
    expect(consultadas).toContain("organization_user_profiles");
    expect(consultadas).toContain("employees");
  });

  it("un departamento se busca en perfiles y en legajos", async () => {
    const { cliente, consultas } = supabaseFalso();
    await deleteDepartment({ supabase: cliente, ...BASE, departmentId: "dep-1" });

    const consultadas = consultas.filter((c) => c.filtros.includes("department_id=dep-1")).map((c) => c.tabla);
    expect(consultadas).toContain("organization_user_profiles");
    expect(consultadas).toContain("employees");
  });

  it("una locación cuenta también si está entre las asignadas", async () => {
    // El caso que se escapaba: alguien con la locacion en location_scope_ids
    // pero con otra como sucursal propia.
    const { cliente, consultas } = supabaseFalso();
    await deleteBranch({ supabase: cliente, ...BASE, branchId: "loc-1" });

    const conAlcance = consultas.filter((c) =>
      c.filtros.some((f) => f.includes("location_scope_ids.cs.{loc-1}")),
    );
    expect(conAlcance.length, "no se miro location_scope_ids").toBeGreaterThan(0);
    expect(conAlcance.map((c) => c.tabla)).toContain("employees");
  });
});

describe("no borra lo que está en uso", () => {
  it("un puesto asignado a alguien no se borra", async () => {
    const { cliente, consultas } = supabaseFalso({ conteos: { organization_user_profiles: 3 } });

    const resultado = await deleteDepartmentPosition({ supabase: cliente, ...BASE, positionId: "pos-1" });

    expect(resultado.ok).toBe(false);
    expect(consultas.some((c) => c.filtros.includes("DELETE"))).toBe(false);
  });

  it("un puesto asignado solo en el legajo tampoco se borra", async () => {
    // Alguien cargado sin cuenta: existe en employees y no en perfiles.
    const { cliente, consultas } = supabaseFalso({ conteos: { employees: 1 } });

    const resultado = await deleteDepartmentPosition({ supabase: cliente, ...BASE, positionId: "pos-1" });

    expect(resultado.ok, "se borro un puesto que alguien tenia en su legajo").toBe(false);
    expect(consultas.some((c) => c.filtros.includes("DELETE"))).toBe(false);
  });

  it("una locación en uso no se borra", async () => {
    const { cliente } = supabaseFalso({ conteos: { memberships: 2 } });
    const resultado = await deleteBranch({ supabase: cliente, ...BASE, branchId: "loc-1" });
    expect(resultado.ok).toBe(false);
  });

  it("un puesto libre sí se borra", async () => {
    const { cliente, consultas } = supabaseFalso();
    const resultado = await deleteDepartmentPosition({ supabase: cliente, ...BASE, positionId: "pos-1" });

    expect(resultado.ok).toBe(true);
    expect(consultas.some((c) => c.tabla === "department_positions" && c.filtros.includes("DELETE"))).toBe(true);
  });

  it("un departamento con puestos no se borra", async () => {
    const { cliente } = supabaseFalso({ conteos: { department_positions: 1 } });
    const resultado = await deleteDepartment({ supabase: cliente, ...BASE, departmentId: "dep-1" });
    expect(resultado.ok).toBe(false);
  });
});
