import { describe, expect, it } from "vitest";

import {
  normalizeBillingPeriod,
  normalizeCurrencyCode,
  normalizePlanCode,
  normalizePlanType,
  parseFeatures,
  parsePriceAmount,
  toFriendlyPlanErrorMessage,
  toNullableInt,
} from "../normalize";

/**
 * Como se leen los datos de un plan antes de guardarlos.
 *
 * No tenian test y viven donde mas duele equivocarse: parsePriceAmount decide
 * el precio que se le cobra a un cliente. Una coma leida al reves o un negativo
 * que pasa serian plata mal cobrada.
 */

describe("parsePriceAmount", () => {
  it("lee un precio normal", () => {
    expect(parsePriceAmount("49.90")).toBe(49.9);
    expect(parsePriceAmount("100")).toBe(100);
  });

  it("acepta la coma como separador decimal", () => {
    // Alguien que escribe 49,90 tiene que pagar 49.90, no 4990.
    expect(parsePriceAmount("49,90")).toBe(49.9);
  });

  it("redondea a dos decimales", () => {
    expect(parsePriceAmount("10.999")).toBe(11);
    expect(parsePriceAmount("10.994")).toBe(10.99);
  });

  it("vacío es sin precio, no cero", () => {
    // Cero seria gratis; null es "no se definio".
    expect(parsePriceAmount("")).toBeNull();
    expect(parsePriceAmount("   ")).toBeNull();
    expect(parsePriceAmount(null)).toBeNull();
  });

  it("rechaza negativos", () => {
    expect(parsePriceAmount("-10")).toBeNull();
  });

  it("rechaza lo que no es un número", () => {
    expect(parsePriceAmount("gratis")).toBeNull();
    expect(parsePriceAmount("10 dolares")).toBeNull();
  });

  it("el cero es un precio válido", () => {
    expect(parsePriceAmount("0")).toBe(0);
  });
});

describe("normalizePlanCode", () => {
  it("pasa a minúsculas y reemplaza los símbolos", () => {
    expect(normalizePlanCode("Plan Pro 2026")).toBe("plan_pro_2026");
  });

  it("no deja guiones bajos sueltos en las puntas", () => {
    expect(normalizePlanCode("  ¡Plan!  ")).toBe("plan");
  });

  it("corta a 40 caracteres", () => {
    expect(normalizePlanCode("a".repeat(60))).toHaveLength(40);
  });

  it("un nombre solo de símbolos queda vacío", () => {
    expect(normalizePlanCode("!!!")).toBe("");
  });
});

describe("normalizeCurrencyCode", () => {
  it("deja tres letras en mayúscula", () => {
    expect(normalizeCurrencyCode("usd")).toBe("USD");
    expect(normalizeCurrencyCode(" us$d ")).toBe("USD");
  });

  it("corta a tres", () => {
    expect(normalizeCurrencyCode("DOLARES")).toBe("DOL");
  });
});

describe("normalizeBillingPeriod", () => {
  it("acepta los períodos conocidos", () => {
    for (const p of ["monthly", "yearly", "one_time", "custom"]) {
      expect(normalizeBillingPeriod(p)).toBe(p);
    }
  });

  it("no distingue mayúsculas", () => {
    expect(normalizeBillingPeriod(" Yearly ")).toBe("yearly");
  });

  it("cualquier otra cosa cae en mensual", () => {
    expect(normalizeBillingPeriod("semanal")).toBe("monthly");
    expect(normalizeBillingPeriod("")).toBe("monthly");
  });
});

describe("normalizePlanType", () => {
  it("acepta los dos tipos que existen", () => {
    expect(normalizePlanType("platform")).toBe("platform");
    expect(normalizePlanType("qbo_r365")).toBe("qbo_r365");
  });

  it("lo desconocido cae en plataforma", () => {
    // Nunca debe caer en el de integracion por accidente: ese cobra distinto.
    expect(normalizePlanType("otro")).toBe("platform");
    expect(normalizePlanType("")).toBe("platform");
  });
});

describe("toNullableInt", () => {
  it("lee un entero", () => {
    expect(toNullableInt("5")).toBe(5);
  });

  it("trunca los decimales", () => {
    expect(toNullableInt("5.9")).toBe(5);
  });

  it("vacío o inválido es null", () => {
    expect(toNullableInt("")).toBeNull();
    expect(toNullableInt(null)).toBeNull();
    expect(toNullableInt("muchos")).toBeNull();
  });

  it("rechaza negativos", () => {
    expect(toNullableInt("-3")).toBeNull();
  });

  it("el cero es válido", () => {
    expect(toNullableInt("0")).toBe(0);
  });
});

describe("parseFeatures", () => {
  it("lee un JSON válido", () => {
    expect(parseFeatures('{"a":1}')).toEqual({ a: 1 });
  });

  it("un JSON roto no rompe: devuelve null", () => {
    expect(parseFeatures("{no es json")).toBeNull();
  });

  it("vacío es null", () => {
    expect(parseFeatures("")).toBeNull();
    expect(parseFeatures(null)).toBeNull();
  });
});

describe("toFriendlyPlanErrorMessage", () => {
  it("explica qué migración falta cuando no existe la tabla", () => {
    const m = toFriendlyPlanErrorMessage("Could not find the table 'public.plans' in the schema cache");
    expect(m).toContain("20260311_0001_base_saas.sql");
  });

  it("explica la migración de precios", () => {
    expect(toFriendlyPlanErrorMessage("column price_amount does not exist")).toContain("202603110002_plan_pricing.sql");
  });

  it("un error que no reconoce lo deja tal cual", () => {
    // Peor que un mensaje crudo es uno inventado que despista.
    expect(toFriendlyPlanErrorMessage("timeout de red")).toBe("timeout de red");
  });
});
