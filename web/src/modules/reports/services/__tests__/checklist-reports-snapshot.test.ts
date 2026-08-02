import { afterEach, describe, expect, it, vi } from "vitest";

import {
  colorForUser,
  formatDateLabel,
  initials,
  relativeFromNow,
  shortName,
} from "../checklist-reports-snapshot";

/**
 * Como se lee un reporte de checklists.
 *
 * El modulo no tenia ningun test. Lo que se prueba aca es la parte pura -- la
 * que arma las etiquetas que ve la persona -- porque es donde estan los bordes
 * que se rompen sin avisar: el corte de "Hoy" a la medianoche, un nombre vacio,
 * una fecha invalida. Un error ahi no borra datos, pero muestra numeros y
 * fechas que no son.
 *
 * La consulta que arma el resumen (buildChecklistReportsSnapshot) sigue sin
 * cubrir: es de solo lectura y su valor esta en la agregacion contra la base.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe("initials", () => {
  it("toma la inicial del nombre y del apellido", () => {
    expect(initials("Ana Laura")).toBe("AL");
  });

  it("con un solo nombre devuelve una letra", () => {
    expect(initials("Angelo")).toBe("A");
  });

  it("ignora los espacios de más", () => {
    expect(initials("  Tavo   Garcia  ")).toBe("TG");
  });

  it("solo usa las dos primeras palabras", () => {
    expect(initials("José Luis Narváez Pérez")).toBe("JL");
  });

  it("sin nombre no queda vacío", () => {
    expect(initials("")).toBe("EM");
    expect(initials("   ")).toBe("EM");
  });
});

describe("shortName", () => {
  it("deja el nombre y la inicial del apellido", () => {
    expect(shortName("Ana Laura")).toBe("Ana L.");
  });

  it("con un solo nombre lo deja tal cual", () => {
    expect(shortName("Angelo")).toBe("Angelo");
  });

  it("sin nombre muestra algo legible en vez de vacío", () => {
    expect(shortName("")).toBe("Empleado");
  });
});

describe("formatDateLabel", () => {
  const hoyCero = new Date("2026-08-02T00:00:00");

  it("lo de hoy dice Hoy", () => {
    expect(formatDateLabel("2026-08-02T09:30:00", hoyCero)).toBe("Hoy");
  });

  it("justo la medianoche ya es hoy", () => {
    // El borde: a las 00:00 arranca el dia, no sigue siendo ayer.
    expect(formatDateLabel("2026-08-02T00:00:00", hoyCero)).toBe("Hoy");
  });

  it("un minuto antes de medianoche es ayer", () => {
    expect(formatDateLabel("2026-08-01T23:59:00", hoyCero)).toBe("Ayer");
  });

  it("lo de anteayer muestra la fecha", () => {
    const etiqueta = formatDateLabel("2026-07-28T10:00:00", hoyCero);
    expect(etiqueta).not.toBe("Hoy");
    expect(etiqueta).not.toBe("Ayer");
    expect(etiqueta).toMatch(/\d{2}\/\d{2}/);
  });

  it("sin fecha o con una fecha rota no rompe", () => {
    expect(formatDateLabel(null, hoyCero)).toBe("Sin fecha");
    expect(formatDateLabel("no es una fecha", hoyCero)).toBe("Sin fecha");
  });
});

describe("relativeFromNow", () => {
  it("hace minutos cuando es reciente", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    expect(relativeFromNow("2026-08-02T11:30:00")).toBe("hace 30m");
  });

  it("pasa a horas después de una hora", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    expect(relativeFromNow("2026-08-02T09:00:00")).toBe("hace 3h");
  });

  it("una fecha futura no muestra tiempo negativo", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T12:00:00"));
    expect(relativeFromNow("2026-08-02T18:00:00")).toBe("hace 0m");
  });

  it("sin fecha devuelve vacío", () => {
    expect(relativeFromNow(null)).toBe("");
    expect(relativeFromNow("cualquier cosa")).toBe("");
  });
});

describe("colorForUser", () => {
  it("la misma persona siempre tiene el mismo color", () => {
    expect(colorForUser("u1")).toBe(colorForUser("u1"));
  });

  it("siempre devuelve un color de la paleta", () => {
    for (const id of ["u1", "u2", "u3", "", "aaaaaaaa-bbbb-cccc"]) {
      expect(colorForUser(id)).toBeTruthy();
      expect(typeof colorForUser(id)).toBe("string");
    }
  });
});
