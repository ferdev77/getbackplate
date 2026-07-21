import { describe, expect, it } from "vitest";
import {
  BILLING_SENDER_NAME,
  buildBillingSubject,
  paymentFailedTemplate,
  planRenewalReminderTemplate,
  successfulPaymentTemplate,
} from "./billing";

describe("billing emails", () => {
  it("always identifies GetBackplate Billing", () => {
    expect(BILLING_SENDER_NAME).toBe("GetBackplate Billing");
    expect(buildBillingSubject("Payment received")).toBe("[GetBackplate Billing] Payment received");
  });

  it("uses GetBackplate identity and Houston in a renewal reminder", () => {
    const html = planRenewalReminderTemplate({
      orgName: "Prodel Distribution",
      renewalDate: "August 20, 2026",
      amount: "$649.00 USD",
    });

    expect(html).toContain('src="https://www.getbackplate.com/getbackplate-logo-light.svg"');
    expect(html).toContain('alt="GetBackplate"');
    expect(html).toContain("1321 Upland Dr., Suite 9894, Houston, TX 77043");
    expect(html).toContain("Hello <strong>Prodel Distribution</strong>");
  });

  it("keeps payment failure and receipt emails under GetBackplate Billing", () => {
    const failed = paymentFailedTemplate({
      orgName: "Prodel Distribution",
      retryLink: "https://app.getbackplate.com/app/billing",
    });
    const receipt = successfulPaymentTemplate({
      orgName: "Prodel Distribution",
      paymentDate: "July 20, 2026",
      amount: "$649.00 USD",
      invoiceNumber: "PREVIEW-001",
      lineItems: [{ description: "Integration plan", amount: "$649.00 USD" }],
      billingPortalUrl: "https://app.getbackplate.com/app/billing",
    });

    for (const html of [failed, receipt]) {
      expect(html).toContain("GetBackplate");
      expect(html).toContain("1321 Upland Dr., Suite 9894, Houston, TX 77043");
    }
  });
});
