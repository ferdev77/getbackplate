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
      ["este"],
      SUCURSALES,
    );

    expect(label).toBe("Este");
  });

  it("siempre es una sola locacion, nunca un resumen", () => {
    // Coincide en tres y aun asi se muestra una: la primera marcada.
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este", "norte"] }),
      ["este", "norte", "sur"],
      SUCURSALES,
    );

    expect(label).toBe("Este");
  });

  it("quien alcanza todas entra por la que se marco", () => {
    // Antes decia "Todas las locaciones", que no era por donde entraba.
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este", "norte", "oeste"] }),
      ["este"],
      SUCURSALES,
    );

    expect(label).toBe("Este");
  });

  it("sumar otra locacion no le cambia la etiqueta a quien ya entro", () => {
    // Se marca Sur primero y entra por Sur. Al marcar tambien Este sigue
    // mostrando Sur: entro por ahi y no tiene por que moverse.
    const conSurPrimero = locationLabelForUser(
      persona({ location_ids: ["sur", "este"] }),
      ["sur"],
      SUCURSALES,
    );
    const trasAgregarEste = locationLabelForUser(
      persona({ location_ids: ["sur", "este"] }),
      ["sur", "este"],
      SUCURSALES,
    );

    expect(conSurPrimero).toBe("Sur");
    expect(trasAgregarEste).toBe("Sur");
  });

  it("si se saca la primera, pasa a la siguiente que le corresponda", () => {
    const label = locationLabelForUser(
      persona({ location_ids: ["sur", "este"] }),
      ["este"],
      SUCURSALES,
    );

    expect(label).toBe("Este");
  });

  it("sin locaciones elegidas muestra la suya, como antes", () => {
    // Alcance por departamento o puesto, o toda la organizacion: no hay una
    // locacion "por la que entra".
    const label = locationLabelForUser(persona({ location_ids: ["sur", "este"] }), [], SUCURSALES);

    expect(label).toBe("Sur");
  });

  it("a quien se agrego a mano y no coincide, se lo muestra con la suya", () => {
    const label = locationLabelForUser(persona({ location_ids: ["sur"] }), ["este"], SUCURSALES);

    expect(label).toBe("Sur");
  });

  it("sin datos de locacion no inventa nada", () => {
    const label = locationLabelForUser(
      persona({ location_ids: [], location_label: undefined }),
      ["este"],
      SUCURSALES,
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
