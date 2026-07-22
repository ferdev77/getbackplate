import { describe, expect, it } from "vitest";

import { buildOrgReportText, type OrgWeeklyReportData } from "./weekly-invoice-report.service";

const report: OrgWeeklyReportData = {
  organizationId: "org-id",
  organizationName: "Prodel Distribution",
  periodStart: "2026-07-21",
  periodEnd: "2026-08-20",
  isHistorical: false,
  groups: [],
};

describe("buildOrgReportText", () => {
  it("uses monthly wording for organization billing-cycle reports", () => {
    const result = buildOrgReportText(report, "monthly");

    expect(result.subject).toContain("Monthly invoice delivery summary");
    expect(result.text).toContain("Here is your monthly report");
    expect(result.text).not.toContain("weekly report");
  });
});
