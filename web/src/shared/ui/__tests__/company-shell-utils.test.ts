import { describe, it, expect } from "vitest";
import {
  isActive,
  normalizeTheme,
  normalizePlanPeriod,
  getPlanAmountByCycle,
  formatPlanPrice,
  resolveCompanyShellLocale,
} from "../company-shell-utils";

describe("isActive", () => {
  const sp = new URLSearchParams();

  it("retorna true cuando pathname coincide exactamente con href", () => {
    expect(isActive("/app/employees", sp, "/app/employees")).toBe(true);
  });

  it("retorna true cuando pathname empieza con el href", () => {
    expect(isActive("/app/employees/detail", sp, "/app/employees")).toBe(true);
  });

  it("retorna false para paths no relacionados", () => {
    expect(isActive("/app/documents", sp, "/app/employees")).toBe(false);
  });

  it("verifica query string si el href la tiene", () => {
    const spWithTab = new URLSearchParams("tab=users");
    expect(isActive("/app/employees", spWithTab, "/app/employees?tab=users")).toBe(true);
    expect(isActive("/app/employees", new URLSearchParams(), "/app/employees?tab=users")).toBe(false);
  });
});

describe("resolveCompanyShellLocale", () => {
  it("forces English for integration-plan organizations", () => {
    expect(resolveCompanyShellLocale({
      integrationPlanId: "integration-plan-id",
    })).toBe("en");
  });

  it("forces Spanish for platform-only organizations", () => {
    expect(resolveCompanyShellLocale({
      integrationPlanId: null,
    })).toBe("es");
  });
});

describe("normalizeTheme", () => {
  it("normaliza variantes de dark a dark-pro", () => {
    expect(normalizeTheme("dark")).toBe("dark-pro");
    expect(normalizeTheme("dark-pro")).toBe("dark-pro");
    expect(normalizeTheme("DARK")).toBe("dark-pro");
  });

  it("retorna default para valores desconocidos", () => {
    expect(normalizeTheme("neon-rainbow")).toBe("default");
  });

  it("acepta el tema default", () => {
    expect(normalizeTheme("default")).toBe("default");
  });
});

describe("normalizePlanPeriod", () => {
  it("retorna yearly para 'yearly'", () => {
    expect(normalizePlanPeriod("yearly")).toBe("yearly");
  });

  it("retorna yearly para 'annual'", () => {
    expect(normalizePlanPeriod("annual")).toBe("yearly");
  });

  it("retorna monthly para null", () => {
    expect(normalizePlanPeriod(null)).toBe("monthly");
  });

  it("retorna monthly para undefined", () => {
    expect(normalizePlanPeriod(undefined)).toBe("monthly");
  });

  it("retorna monthly para valores desconocidos", () => {
    expect(normalizePlanPeriod("quarterly")).toBe("monthly");
  });
});

describe("getPlanAmountByCycle", () => {
  it("retorna null si priceAmount no es número", () => {
    expect(getPlanAmountByCycle({ priceAmount: null, billingPeriod: "monthly" }, "monthly")).toBeNull();
  });

  it("retorna el mismo precio si el ciclo coincide", () => {
    expect(getPlanAmountByCycle({ priceAmount: 50, billingPeriod: "monthly" }, "monthly")).toBe(50);
  });

  it("multiplica por 10 al convertir monthly a yearly", () => {
    expect(getPlanAmountByCycle({ priceAmount: 50, billingPeriod: "monthly" }, "yearly")).toBe(500);
  });

  it("divide por 10 al convertir yearly a monthly", () => {
    expect(getPlanAmountByCycle({ priceAmount: 500, billingPeriod: "yearly" }, "monthly")).toBe(50);
  });
});

  describe("formatPlanPrice", () => {
  it("formatea precio mensual correctamente", () => {
    expect(formatPlanPrice({ priceAmount: 49, billingPeriod: "monthly" }, "monthly")).toBe("$49/mes");
  });

  it("formatea precio anual correctamente", () => {
    expect(formatPlanPrice({ priceAmount: 490, billingPeriod: "yearly" }, "yearly")).toBe("$490/año");
  });

  it("retorna texto de fallback si no hay precio", () => {
    expect(formatPlanPrice({ priceAmount: null, billingPeriod: "monthly" })).toBe("Precio no definido");
  });

  it("usa el ciclo del plan si no se especifica ciclo", () => {
    expect(formatPlanPrice({ priceAmount: 100, billingPeriod: "monthly" })).toBe("$100/mes");
  });

  it("formats plan prices in English for integration organizations", () => {
    expect(formatPlanPrice({ priceAmount: 49, billingPeriod: "monthly" }, "monthly", "en")).toBe("$49/month");
    expect(formatPlanPrice({ priceAmount: 490, billingPeriod: "yearly" }, "yearly", "en")).toBe("$490/year");
    expect(formatPlanPrice({ priceAmount: null, billingPeriod: "monthly" }, undefined, "en")).toBe("Price not defined");
  });
});
