import { describe, expect, it } from "vitest";

import { resolvePreferredMembership, type MembershipContext } from "../queries";

/**
 * En que organizacion cae alguien al entrar.
 *
 * No tenia test y decide algo delicado: con una sola membresia entra directo;
 * con varias hay que preguntarle, porque elegirle una a dedo lo meteria en el
 * tenant equivocado. El orden tiene que ser estable -- si cambiara entre
 * pedidos, la misma persona entraria a lugares distintos sin tocar nada.
 */

function membresia(extra: Partial<MembershipContext> = {}): MembershipContext {
  return {
    membershipId: "mem-1",
    organizationId: "org-1",
    roleId: "rol-1",
    branchId: null,
    roleCode: "employee",
    createdAt: "2026-01-01T00:00:00Z",
    ...extra,
  };
}

describe("sin membresías", () => {
  it("no elige nada ni pregunta", () => {
    expect(resolvePreferredMembership([])).toEqual({
      selected: null,
      requiresSelection: false,
      organizationsCount: 0,
    });
  });
});

describe("una sola organización", () => {
  it("entra directo, sin preguntar", () => {
    const r = resolvePreferredMembership([membresia()]);

    expect(r.requiresSelection).toBe(false);
    expect(r.selected?.organizationId).toBe("org-1");
    expect(r.organizationsCount).toBe(1);
  });

  it("dos membresías en la misma organización siguen siendo una sola", () => {
    // Ser admin y empleado del mismo lugar no obliga a elegir.
    const r = resolvePreferredMembership([
      membresia({ membershipId: "mem-1", roleCode: "employee" }),
      membresia({ membershipId: "mem-2", roleCode: "company_admin" }),
    ]);

    expect(r.organizationsCount).toBe(1);
    expect(r.requiresSelection).toBe(false);
    // Entre las dos, manda la de admin.
    expect(r.selected?.roleCode).toBe("company_admin");
  });
});

describe("varias organizaciones", () => {
  const dos = [
    membresia({ membershipId: "mem-1", organizationId: "org-1" }),
    membresia({ membershipId: "mem-2", organizationId: "org-2" }),
  ];

  it("pregunta en vez de elegir por su cuenta", () => {
    const r = resolvePreferredMembership(dos);

    expect(r.requiresSelection).toBe(true);
    expect(r.selected).toBeNull();
    expect(r.organizationsCount).toBe(2);
  });

  it("si ya venía con una elegida, la respeta y no pregunta", () => {
    const r = resolvePreferredMembership(dos, "org-2");

    expect(r.requiresSelection).toBe(false);
    expect(r.selected?.organizationId).toBe("org-2");
  });

  it("si la elegida no es suya, vuelve a preguntar en vez de meterlo en otra", () => {
    // Lo importante: no cae en la primera que encuentre.
    const r = resolvePreferredMembership(dos, "org-ajena");

    expect(r.requiresSelection).toBe(true);
    expect(r.selected).toBeNull();
  });
});

describe("el orden es estable", () => {
  it("el rol de admin va primero", () => {
    const r = resolvePreferredMembership([
      membresia({ membershipId: "b", roleCode: "employee" }),
      membresia({ membershipId: "a", roleCode: "company_admin" }),
    ]);

    expect(r.selected?.membershipId).toBe("a");
  });

  it("a igual rol, gana la más reciente", () => {
    const r = resolvePreferredMembership([
      membresia({ membershipId: "vieja", createdAt: "2025-01-01T00:00:00Z" }),
      membresia({ membershipId: "nueva", createdAt: "2026-06-01T00:00:00Z" }),
    ]);

    expect(r.selected?.membershipId).toBe("nueva");
  });

  it("a igual rol y misma fecha, decide el id y no el azar", () => {
    // Sin este desempate, dos pedidos iguales podrian entrar a lugares
    // distintos segun como viniera ordenada la consulta.
    const filas = [
      membresia({ membershipId: "zzz" }),
      membresia({ membershipId: "aaa" }),
    ];

    expect(resolvePreferredMembership(filas).selected?.membershipId).toBe("aaa");
    expect(resolvePreferredMembership([...filas].reverse()).selected?.membershipId).toBe("aaa");
  });

  it("no modifica la lista que recibe", () => {
    const filas = [
      membresia({ membershipId: "b", roleCode: "employee" }),
      membresia({ membershipId: "a", roleCode: "company_admin" }),
    ];

    resolvePreferredMembership(filas);

    expect(filas.map((f) => f.membershipId)).toEqual(["b", "a"]);
  });

  it("un rol desconocido no se cuela adelante del admin", () => {
    const r = resolvePreferredMembership([
      membresia({ membershipId: "raro", roleCode: "lo-que-sea" }),
      membresia({ membershipId: "admin", roleCode: "company_admin" }),
    ]);

    expect(r.selected?.membershipId).toBe("admin");
  });
});
