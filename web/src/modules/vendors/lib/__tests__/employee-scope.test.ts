import { describe, expect, it, vi, beforeEach } from "vitest";

const resolveEmployeeAllowedLocationIds = vi.hoisted(() => vi.fn(async () => ["sur"]));

vi.mock("@/modules/employees/lib/api-scope", () => ({ resolveEmployeeAllowedLocationIds }));

const { resolveEmployeeVendorScope, locacionesFueraDeAlcance } = await import("../employee-scope");

/**
 * Que proveedores ve y toca un empleado.
 *
 * La regla: el company admin alcanza todo; el empleado, solo los proveedores de
 * sus locaciones. Antes el portal devolvia todos los de la organizacion y dejaba
 * crear, editar y borrar cualquiera.
 */

type Asignacion = { vendor_id: string; branch_id: string | null };

function supabaseFalso(asignaciones: Asignacion[]) {
  const cadena = {
    select: () => cadena,
    eq: () => cadena,
    data: asignaciones,
    error: null,
  };
  return { from: () => cadena } as never;
}

beforeEach(() => {
  resolveEmployeeAllowedLocationIds.mockResolvedValue(["sur"]);
});

describe("resolveEmployeeVendorScope", () => {
  it("solo ve los proveedores de sus locaciones", async () => {
    const alcance = await resolveEmployeeVendorScope(
      supabaseFalso([
        { vendor_id: "prov-sur", branch_id: "sur" },
        { vendor_id: "prov-norte", branch_id: "norte" },
      ]),
      "org-1",
      "empleado",
    );

    expect([...alcance.visibleVendorIds]).toEqual(["prov-sur"]);
  });

  it("ve un proveedor que sirve a varias locaciones si una es suya", async () => {
    const alcance = await resolveEmployeeVendorScope(
      supabaseFalso([
        { vendor_id: "prov", branch_id: "norte" },
        { vendor_id: "prov", branch_id: "sur" },
      ]),
      "org-1",
      "empleado",
    );

    expect([...alcance.visibleVendorIds]).toEqual(["prov"]);
  });

  it("ve los proveedores sin locación asignada", async () => {
    // Si no los viera nadie, un proveedor de toda la empresa quedaria invisible
    // para todos los empleados.
    const alcance = await resolveEmployeeVendorScope(
      supabaseFalso([{ vendor_id: "prov-global", branch_id: null }]),
      "org-1",
      "empleado",
    );

    expect([...alcance.visibleVendorIds]).toEqual(["prov-global"]);
  });

  it("con varias locaciones asignadas ve las de todas", async () => {
    resolveEmployeeAllowedLocationIds.mockResolvedValue(["sur", "norte"]);

    const alcance = await resolveEmployeeVendorScope(
      supabaseFalso([
        { vendor_id: "prov-sur", branch_id: "sur" },
        { vendor_id: "prov-norte", branch_id: "norte" },
        { vendor_id: "prov-este", branch_id: "este" },
      ]),
      "org-1",
      "empleado",
    );

    expect([...alcance.visibleVendorIds].sort()).toEqual(["prov-norte", "prov-sur"]);
  });

  it("sin locaciones habilitadas no ve ninguno con locación", async () => {
    resolveEmployeeAllowedLocationIds.mockResolvedValue([]);

    const alcance = await resolveEmployeeVendorScope(
      supabaseFalso([{ vendor_id: "prov-sur", branch_id: "sur" }]),
      "org-1",
      "empleado",
    );

    expect([...alcance.visibleVendorIds]).toEqual([]);
  });
});

describe("locacionesFueraDeAlcance", () => {
  it("acepta las locaciones habilitadas", () => {
    expect(locacionesFueraDeAlcance(["sur"], ["sur", "norte"])).toEqual([]);
  });

  it("detecta una locación fuera del alcance", () => {
    expect(locacionesFueraDeAlcance(["sur", "este"], ["sur", "norte"])).toEqual(["este"]);
  });

  it("sin locaciones elegidas no hay nada fuera", () => {
    expect(locacionesFueraDeAlcance([], ["sur"])).toEqual([]);
  });

  it("con el alcance vacío, cualquier locación queda afuera", () => {
    expect(locacionesFueraDeAlcance(["sur"], [])).toEqual(["sur"]);
  });
});
