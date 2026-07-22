import { describe, expect, it } from "vitest";

import { buildWeeklyReportHtml, type WeeklyReportTemplateInput } from "./weekly-report-template";

const baseInput: WeeklyReportTemplateInput = {
  recipientName: "Downtown",
  periodLabel: "07/21/2026 - 08/20/2026",
  invoiceLines: [],
  vendorCompany: "Prodel",
  vendorLogoUrl: null,
  vendorPhone: null,
  vendorEmail: null,
  showReferralCta: true,
  referralUrl: "https://app.getbackplate.com/refer/example",
  platformUrl: "https://app.getbackplate.com/integrations/qbo-r365",
  recurrenceNotice: "Monthly recurrence notice.",
  isFirstReport: false,
  cadence: "monthly",
  preferencesUrl: "https://app.getbackplate.com/email/preferences?token=secret&unsub=1",
};

describe("buildWeeklyReportHtml", () => {
  it("renders monthly language and zero state even for a branch referral report", () => {
    const html = buildWeeklyReportHtml(baseInput);

    expect(html).toContain("<title>Monthly delivery report");
    expect(html).toContain("your monthly summary");
    expect(html).toContain("This month");
    expect(html).toContain("No invoices this month");
    expect(html).not.toContain("No invoices this week");
  });

  it("renders an unsubscribe link for a primary report", () => {
    const html = buildWeeklyReportHtml(baseInput);

    expect(html).toContain("Unsubscribe");
    expect(html).toContain(baseInput.preferencesUrl!.replace("&", "&amp;"));
  });

  it("renders an internal banner without a preferences URL", () => {
    const html = buildWeeklyReportHtml({
      ...baseInput,
      preferencesUrl: null,
      internalCopyRecipient: "primary@example.com",
    });

    expect(html).toContain("Internal copy");
    expect(html).toContain("primary@example.com");
    expect(html).not.toContain("token=secret");
    expect(html).not.toContain("Unsubscribe");
  });

  it("escapes report data and rejects unsafe URLs", () => {
    const html = buildWeeklyReportHtml({
      ...baseInput,
      recipientName: '<img src=x onerror="alert(1)">',
      vendorCompany: "Vendor <script>alert(1)</script>",
      vendorLogoUrl: "javascript:alert(1)",
      invoiceLines: [{
        docNumber: '<a href="https://evil.example">1</a>',
        sentAt: "2026-07-21T00:00:00.000Z",
        totalAmount: 10,
        clientName: "Client <b>name</b>",
      }],
      showClientColumn: true,
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Client &lt;b&gt;name&lt;/b&gt;");
  });
});
