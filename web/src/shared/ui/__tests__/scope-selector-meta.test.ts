import { describe, expect, it } from "vitest";

import { locationLabelForUser, searchHaystack, type ScopeSelectorUser } from "../scope-selector";

/**
 * Con que locacion se muestra a una persona en la audiencia del selector.
 *
 * Se mostraba siempre su sucursal principal, y como una persona puede alcanzar
 * varias, el panel quedaba diciendo cosas como "Sur" cuando lo elegido era
 * "Este". No estaba mal el calculo -- esa persona alcanza las dos -- pero se
 * leia como si el filtro fallara. Estos tests fijan que se muestre la locacion
 * por la que entra.
 */

const SUCURSALES = new Map([
  ["este", "Este"],
  ["sur", "Sur"],
  ["norte", "Norte"],
  ["oeste", "Oeste"],
]);
const TOTAL = SUCURSALES.size;

function persona(campos: Partial<ScopeSelectorUser> = {}): ScopeSelectorUser {
  return {
    id: "e1",
    user_id: "u1",
    first_name: "Cuatro",
    last_name: "Cardinales",
    branch_id: "sur",
    location_ids: ["sur"],
    location_label: "Sur",
    department_label: "Front of house",
    position_label: "Cafetero",
    ...campos,
  };
}

describe("locationLabelForUser", () => {
  it("muestra la locacion por la que entra, no su sucursal", () => {
    // El caso reportado: alcanza Sur y Este, se elige Este, y aparecia "Sur".
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este"] }),
      new Set(["este"]),
      SUCURSALES,
      TOTAL,
    );

    expect(label).toBe("Este");
  });

  it("si coincide en varias, las lista", () => {
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este", "norte"] }),
      new Set(["este", "norte"]),
      SUCURSALES,
      TOTAL,
    );

    expect(label).toBe("Este, Norte");
  });

  it("con muchas coincidencias corta y cuenta el resto", () => {
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este", "norte"] }),
      new Set(["sur", "este", "norte"]),
      SUCURSALES,
      // Total mayor que las suyas: no alcanza toda la organizacion.
      TOTAL + 2,
    );

    expect(label).toBe("Sur, Este +1");
  });

  it("quien alcanza toda la organizacion se muestra asi, sin enumerar", () => {
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este", "norte", "oeste"] }),
      new Set(["este"]),
      SUCURSALES,
      TOTAL,
    );

    expect(label).toBe("Todas las locaciones");
  });

  it("sin locaciones elegidas muestra la suya, como antes", () => {
    // Alcance por departamento o puesto, o toda la organizacion: no hay una
    // locacion "por la que entra".
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este"] }),
      new Set(),
      SUCURSALES,
      TOTAL,
    );

    expect(label).toBe("Sur");
  });

  it("a quien se agrego a mano y no coincide, se lo muestra con la suya", () => {
    const label = locationLabelForUser(
      persona({ location_ids: ["sur"] }),
      new Set(["este"]),
      SUCURSALES,
      TOTAL,
    );

    expect(label).toBe("Sur");
  });

  it("sin datos de locacion no inventa nada", () => {
    const label = locationLabelForUser(
      persona({ location_ids: [], location_label: undefined }),
      new Set(["este"]),
      SUCURSALES,
      TOTAL,
    );

    expect(label).toBeUndefined();
  });
});

describe("searchHaystack", () => {
  it("encuentra por cualquiera de sus locaciones, no solo por la sucursal", () => {
    const texto = searchHaystack(persona({ location_ids: ["sur", "este"] }), SUCURSALES).toLowerCase();

    expect(texto).toContain("sur");
    expect(texto).toContain("este");
    expect(texto).toContain("cuatro cardinales");
    expect(texto).toContain("cafetero");
  });
});
