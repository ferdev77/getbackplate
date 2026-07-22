import { describe, expect, it } from "vitest";
import { getInvoiceQuotaCopy } from "../dashboard-copy";
import { formatIntegrationRenewalReminder } from "../renewal-format";
import { formatInvoiceUsageDescription } from "../usage-billing";

describe("QuickBooks integration billing copy", () => {
  it("describes quota usage as a Stripe billing cycle", () => {
    expect(getInvoiceQuotaCopy(40, 100)).toEqual({
      label: "Invoices This Billing Cycle",
      subLabel: "60 available this billing cycle",
    });
  });

  it("formats usage invoice items in English", () => {
    expect(formatInvoiceUsageDescription(120, 100, 20, "0.99")).toBe(
      "Invoices sent to R365 (120 sent, 100 included, 20 × $0.99)",
    );
  });

  it("formats integration renewal values with the English US locale", () => {
    expect(formatIntegrationRenewalReminder(123456, "usd", Date.UTC(2026, 6, 21, 18) / 1000)).toEqual({
      amount: "$1,234.56",
      renewalDate: "7/21/2026",
    });
  });
});
