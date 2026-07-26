import { describe, expect, it } from "vitest";
import { calculateDocumentAllowance, calculateDocumentOverage } from "./usage-billing-rules";

describe("document usage billing rules", () => {
  it("adds purchased balance to the plan base allowance", () => {
    expect(calculateDocumentAllowance({
      baseAllowance: 500,
      invoiceBalance: 50,
      allowanceOverride: null,
    })).toBe(550);
  });

  it("uses the override instead of base allowance and balance", () => {
    expect(calculateDocumentAllowance({
      baseAllowance: 500,
      invoiceBalance: 50,
      allowanceOverride: 25,
    })).toBe(25);
    expect(calculateDocumentAllowance({
      baseAllowance: 500,
      invoiceBalance: 50,
      allowanceOverride: 0,
    })).toBe(0);
  });

  it("calculates only usage above the allowance", () => {
    expect(calculateDocumentOverage(575, 550)).toBe(25);
  });

  it("never returns a negative overage", () => {
    expect(calculateDocumentOverage(500, 550)).toBe(0);
  });
});
