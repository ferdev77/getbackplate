import { describe, it, expect } from "vitest";
import { resolveHistoryCustomerName } from "../lib/resolve-customer-name";

describe("resolveHistoryCustomerName", () => {
  it("sync → customerName real de la factura, sin override del grupo", () => {
    const item = { customerName: "Taco Palenque Loop 20" };
    expect(resolveHistoryCustomerName(item)).toBe("Taco Palenque Loop 20");
  });

  it("webhook → customerName del item", () => {
    const item = { customerName: "Kumori Central Kitchen" };
    expect(resolveHistoryCustomerName(item)).toBe("Kumori Central Kitchen");
  });

  it("manual → customerName del item", () => {
    const item = { customerName: "Cliente Manual" };
    expect(resolveHistoryCustomerName(item)).toBe("Cliente Manual");
  });

  it("customerName null → '-'", () => {
    const item = { customerName: null };
    expect(resolveHistoryCustomerName(item)).toBe("-");
  });
});
