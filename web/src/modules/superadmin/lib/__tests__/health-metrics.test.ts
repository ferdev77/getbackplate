import { describe, expect, it } from "vitest";

import { computeScore, parseMetadataNumber, percentile, toPercent } from "../health-metrics";

/**
 * El puntaje de salud de un tenant y los calculos del panel de superadmin.
 *
 * No tenian test. De aca sale con que se ordena el riesgo: si el puntaje se
 * calcula mal, un cliente abandonado aparece sano y nadie lo mira. Lo que se
 * prueba es la parte pura, que es donde estan las decisiones.
 */

type Fila = Parameters<typeof computeScore>[0];

function fila(extra: Partial<Fila> = {}): Fila {
  return {
    organization_id: "org-1",
    name: "Juans",
    status: "active",
    plan_id: "plan-1",
    active_admins: 1,
    active_members: 5,
    active_employees: 5,
    enabled_modules: 3,
    docs_30d: 2,
    storage_mb: 10,
    storage_limit_mb: 100,
    checklist_7d: 4,
    active_announcements: 1,
    ...extra,
  } as Fila;
}

describe("computeScore", () => {
  it("un tenant sano llega a 100", () => {
    const r = computeScore(fila());
    expect(r.score).toBe(100);
    expect(r.issues).toEqual([]);
  });

  it("descuenta por cada cosa que falta y la nombra", () => {
    const r = computeScore(fila({ active_admins: 0 }));
    expect(r.score).toBe(65);
    expect(r.issues).toContain("no admin");
  });

  it("un tenant inactivo descuenta y lo dice", () => {
    const r = computeScore(fila({ status: "suspended" }));
    expect(r.score).toBe(80);
    expect(r.issues).toContain("tenant suspended");
  });

  it("sin módulos habilitados descuenta", () => {
    expect(computeScore(fila({ enabled_modules: 0 })).score).toBe(75);
  });

  it("sin empleados activos descuenta", () => {
    expect(computeScore(fila({ active_employees: 0 })).score).toBe(85);
  });

  it("cuenta como sin actividad solo si no hay nada de nada", () => {
    // Con cualquiera de las tres alcanza para no penalizar.
    expect(computeScore(fila({ docs_30d: 0, checklist_7d: 0, active_announcements: 1 })).issues)
      .not.toContain("no activity");
    expect(computeScore(fila({ docs_30d: 0, checklist_7d: 1, active_announcements: 0 })).issues)
      .not.toContain("no activity");

    const muerto = computeScore(fila({ docs_30d: 0, checklist_7d: 0, active_announcements: 0 }));
    expect(muerto.issues).toContain("no activity");
    expect(muerto.score).toBe(90);
  });

  it("los descuentos se suman", () => {
    const r = computeScore(fila({ active_admins: 0, enabled_modules: 0 }));
    expect(r.score).toBe(40);
    expect(r.issues).toHaveLength(2);
  });

  it("nunca baja de cero", () => {
    // Todo mal: 20+35+25+15+10 = 105, mas que 100.
    const r = computeScore(fila({
      status: "suspended", active_admins: 0, enabled_modules: 0,
      active_employees: 0, docs_30d: 0, checklist_7d: 0, active_announcements: 0,
    }));

    expect(r.score).toBe(0);
    expect(r.issues).toHaveLength(5);
  });

  it("los nulos se leen como cero, no rompen la cuenta", () => {
    // La base puede devolver null aunque el tipo diga numero.
    const r = computeScore(fila({ active_admins: null, enabled_modules: null } as unknown as Partial<Fila>));
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.issues).toContain("no admin");
  });

  it("marca el estado de la invitación del admin", () => {
    expect(computeScore(fila()).invitedAdminFirstLoginStatus).toBe("none");
    expect(
      computeScore(fila(), { email: "a@x.com", firstLoginAt: null }).invitedAdminFirstLoginStatus,
    ).toBe("pending");
    expect(
      computeScore(fila(), { email: "a@x.com", firstLoginAt: "2026-01-01" }).invitedAdminFirstLoginStatus,
    ).toBe("completed");
  });
});

describe("toPercent", () => {
  it("calcula el porcentaje con dos decimales", () => {
    expect(toPercent(1, 3)).toBe(33.33);
    expect(toPercent(50, 200)).toBe(25);
  });

  it("sin denominador devuelve cero en vez de romper", () => {
    // Dividir por cero daria NaN o Infinity y se veria en pantalla.
    expect(toPercent(5, 0)).toBe(0);
    expect(toPercent(5, -1)).toBe(0);
  });
});

describe("percentile", () => {
  it("sin datos no inventa un valor", () => {
    expect(percentile([], 95)).toBeNull();
  });

  it("el p100 es el máximo y el p1 el mínimo", () => {
    const valores = [10, 20, 30, 40, 50];
    expect(percentile(valores, 100)).toBe(50);
    expect(percentile(valores, 1)).toBe(10);
  });

  it("no depende del orden en que vengan", () => {
    expect(percentile([50, 10, 30, 20, 40], 100)).toBe(50);
  });

  it("no modifica la lista que recibe", () => {
    const valores = [3, 1, 2];
    percentile(valores, 50);
    expect(valores).toEqual([3, 1, 2]);
  });

  it("un percentil fuera de rango se acota", () => {
    const valores = [10, 20, 30];
    expect(percentile(valores, 999)).toBe(30);
    expect(percentile(valores, -5)).toBe(10);
  });
});

describe("parseMetadataNumber", () => {
  it("toma la primera clave que tenga un número válido", () => {
    expect(parseMetadataNumber({ a: "no", b: "42" }, ["a", "b"])).toBe(42);
  });

  it("ignora negativos y basura", () => {
    expect(parseMetadataNumber({ a: -1 }, ["a"])).toBeNull();
    expect(parseMetadataNumber({ a: "hola" }, ["a"])).toBeNull();
    expect(parseMetadataNumber({}, ["a"])).toBeNull();
  });

  it("el cero es un valor válido", () => {
    expect(parseMetadataNumber({ a: 0 }, ["a"])).toBe(0);
  });
});
