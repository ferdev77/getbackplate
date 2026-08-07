import { describe, expect, it } from "vitest";
import { calculateLedgerTotal, createLedgerSnapshot, renderDevelopmentLedgerReport } from "./report";
import type { DevelopmentLedgerItem } from "./types";

function item(overrides: Partial<DevelopmentLedgerItem> = {}): DevelopmentLedgerItem {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    stableKey: "i1-1",
    occurredOn: "2026-08-07",
    planScope: "integration",
    workType: "new",
    sectionCode: "i1",
    sectionTitle: "1.1 · Entregas",
    title: "Account Number manual",
    rationale: "Evita bloqueos.",
    technicalDetail: "Persistencia por cliente.",
    billingStatus: "to_invoice",
    amountCents: 3000,
    priorInvoiceLabel: null,
    sortOrder: 10,
    ...overrides,
  };
}

describe("development ledger reports", () => {
  it("totals only work classified as to invoice", () => {
    expect(calculateLedgerTotal([
      item(),
      item({ id: "2", billingStatus: "previously_invoiced", amountCents: 9000 }),
      item({ id: "3", billingStatus: "included", amountCents: 5000 }),
      item({ id: "4", billingStatus: "unpriced", amountCents: null }),
    ])).toBe(3000);
  });

  it("renders a standalone escaped document with the approved billing wording", () => {
    const snapshot = createLedgerSnapshot({
      title: "Informe <privado>",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-07",
      generatedAt: "2026-08-07T12:00:00.000Z",
      items: [
        item({ title: "<script>alert(1)</script>" }),
        item({ id: "2", stableKey: "i1-2", billingStatus: "previously_invoiced", amountCents: null }),
      ],
    });
    const html = renderDevelopmentLedgerReport(snapshot);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("Informe &lt;privado&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Facturado anteriormente");
    expect(html).toContain("US$ 30");
  });

  it("renders section-level prices separately from detailed entries", () => {
    const snapshot = createLedgerSnapshot({
      title: "Informe",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-07",
      generatedAt: "2026-08-07T12:00:00.000Z",
      items: [item({ stableKey: "i1-total", title: "Precio del área" }), item()],
    });
    const html = renderDevelopmentLedgerReport(snapshot);

    expect(html).toContain("Precio general del área");
    expect(html.match(/<li>/g)).toHaveLength(1);
  });
});
