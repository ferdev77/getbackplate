import { describe, expect, it } from "vitest";
import { calculateSetupFeeCents } from "./setup-fee";

describe("calculateSetupFeeCents", () => {
  it("charges the full one-time setup fee monthly", () => {
    expect(calculateSetupFeeCents({ setupFeeAmount: 799, billingPeriod: "monthly", annualDiscountPct: 25 })).toBe(79_900);
  });

  it("applies the configured annual discount without waiving the fee", () => {
    expect(calculateSetupFeeCents({ setupFeeAmount: 799, billingPeriod: "annual", annualDiscountPct: 25 })).toBe(59_925);
  });

  it("clamps invalid discount percentages", () => {
    expect(calculateSetupFeeCents({ setupFeeAmount: 100, billingPeriod: "yearly", annualDiscountPct: -5 })).toBe(10_000);
  });
});
