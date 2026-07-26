import { describe, expect, it } from "vitest";

import { buildR365Csv, parseCsvRows } from "../r365-csv";
import {
  buildQboR365DedupeKey,
  buildQboR365FileName,
  getQboDisconnectRetryPlan,
  isActiveClaim,
  normalizeQboRows,
} from "../pipeline-rules";

const baseTransaction = {
  Id: "txn-1",
  DocNumber: "AP/100, west",
  TxnDate: "2026-07-25",
  DueDate: "2026-08-25",
  TotalAmt: 110,
  Balance: 50,
  CustomerRef: { value: "customer-1", name: "Vendor, Inc." },
  CurrencyRef: { value: "USD" },
  TxnTaxDetail: { TotalTax: 10 },
  Line: [{
    Id: "line-1",
    DetailType: "SalesItemLineDetail",
    Amount: 100,
    Description: "Food \"premium\"\ncase",
    SalesItemLineDetail: {
      ItemRef: { value: "item-1", name: "Food: Produce" },
      Qty: 2,
      UnitPrice: 50,
    },
  }],
};

function normalize(kind: "invoice" | "credit") {
  return normalizeQboRows({
    invoices: kind === "invoice" ? [baseTransaction] : [],
    salesReceipts: [],
    creditMemos: kind === "credit" ? [baseTransaction] : [],
    template: "by_item",
    taxMode: "header",
    mappings: [],
    itemSkuMap: new Map([["item-1", "SKU-001"]]),
    customerAcctNumMap: new Map([["customer-1", "LOC-10"]]),
  });
}

describe("QBO to R365 pure pipeline", () => {
  it("normalizes an Invoice, derives payment state, SKU/location, and a separate tax row", () => {
    const lines = normalize("invoice");

    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      sourceInvoiceId: "txn-1",
      sourceLineId: "line-1",
      transactionTypeCode: "1",
      targetCode: "SKU-001",
      location: "LOC-10",
      quantity: 2,
      unitPrice: 50,
      lineAmount: 100,
      taxAmount: 10,
      totalAmount: 110,
      qboPaymentStatus: "partial",
      qboStatusRaw: "Partially Paid",
    });
    expect(lines[1]).toMatchObject({ sourceLineId: "tax", targetCode: "999999", lineAmount: 10 });
  });

  it("normalizes CreditMemo amounts and tax as negative R365 values", () => {
    const lines = normalize("credit");

    expect(lines[0]).toMatchObject({
      transactionTypeCode: "2",
      unitPrice: -50,
      lineAmount: -100,
      totalAmount: -110,
      qboPaymentStatus: "not_applicable",
      qboStatusRaw: "Credit Memo",
    });
    expect(lines[1]).toMatchObject({ transactionTypeCode: "2", unitPrice: -10, lineAmount: -10 });
  });

  it("applies nested mappings and deterministic defaults without mutating the source", () => {
    const source = structuredClone(baseTransaction);
    const [line] = normalizeQboRows({
      invoices: [source], salesReceipts: [], creditMemos: [], template: "by_item", taxMode: "none",
      mappings: [
        { target_field: "description", source_field: "line.Description", transform_rule: { uppercase: true, prefix: "[", suffix: "]" } },
        { target_field: "location", source_field: "invoice.Missing", transform_rule: { default: "DEFAULT" } },
      ],
    });

    expect(line.description).toBe('[FOOD "PREMIUM"\nCASE]');
    expect(line.location).toBe("DEFAULT");
    expect(source).toEqual(baseTransaction);
  });

  it("covers SalesReceipt and account-based fallbacks without tax", () => {
    const [line] = normalizeQboRows({
      invoices: [],
      creditMemos: [],
      salesReceipts: [{
        Id: "receipt-1",
        Balance: 0,
        CustomerRef: { value: "customer-fallback" },
        CurrencyRef: { name: "US Dollar" },
        PrivateNote: "memo",
        PONumber: "PO-1",
        SalesTermRef: { name: "Due now" },
        Line: [{
          DetailType: "AccountBasedExpenseLineDetail",
          Amount: 12,
          AccountBasedExpenseLineDetail: { AccountRef: { value: "account-1", name: "Supplies" }, TaxAmount: 2 },
        }],
      }],
      template: "by_item",
      taxMode: "line",
      mappings: [
        { target_field: "target_code", source_field: null, transform_rule: { default: "TARGET" } },
        { target_field: "vendor", source_field: null, transform_rule: { default: "VENDOR" } },
        { target_field: "memo", source_field: null, transform_rule: { default: "MAPPED" } },
        { target_field: "ignored", source_field: null, transform_rule: { default: "NOOP" } },
      ],
      today: "2026-01-02",
    });

    expect(line).toMatchObject({
      sourceLineId: "1",
      invoiceNumber: "QBO-receipt-1",
      invoiceDate: "2026-01-02",
      dueDate: "2026-01-02",
      transactionTypeCode: "1",
      targetCode: "TARGET",
      itemName: "Supplies",
      vendor: "VENDOR",
      memo: "MAPPED",
      currency: "US Dollar",
      unitPrice: 12,
      taxAmount: 2,
      qboPaymentStatus: "paid",
      qboStatusRaw: "Paid",
      poNumber: "PO-1",
      terms: "Due now",
    });
  });

  it.each([
    [0, "paid", "Paid"],
    [110, "unpaid", "Open"],
    [undefined, "unknown", "Unknown"],
  ] as const)("derives Invoice status from balance %s", (balance, status, rawStatus) => {
    const [line] = normalizeQboRows({
      invoices: [{ ...baseTransaction, Balance: balance, TxnTaxDetail: undefined }],
      salesReceipts: [], creditMemos: [], template: "by_item", taxMode: "none", mappings: [],
    });
    expect(line).toMatchObject({ qboPaymentStatus: status, qboStatusRaw: rawStatus, taxAmount: 0 });
  });

  it("prefers an explicit QBO transaction status and ignores non-detail lines", () => {
    const [line] = normalizeQboRows({
      invoices: [{
        ...baseTransaction,
        TxnStatus: " Custom Status ",
        Line: [{ DetailType: "SubTotalLineDetail", Amount: 999 }, ...baseTransaction.Line],
      } as typeof baseTransaction],
      salesReceipts: [], creditMemos: [], template: "by_item", taxMode: "none", mappings: [],
    });
    expect(line.qboStatusRaw).toBe("Custom Status");
    expect(line.lineAmount).toBe(100);
  });

  it("produces distinct stable dedupe keys for invoice and credit lines", () => {
    const invoice = normalize("invoice")[0];
    const credit = normalize("credit")[0];

    expect(buildQboR365DedupeKey(invoice)).toBe("txn-1:line-1:1:100:SKU-001");
    expect(buildQboR365DedupeKey(credit)).toBe("txn-1:line-1:2:-100:SKU-001");
    expect(buildQboR365DedupeKey(invoice)).toBe(buildQboR365DedupeKey({ ...invoice }));
  });

  it("sanitizes and bounds exported filenames with an injected clock", () => {
    const now = new Date("2026-07-26T12:34:56.000Z");
    expect(buildQboR365FileName("Vendor / east!*", "AP/100, west", now))
      .toBe("Vendor___east___INVAP_100__west_20260726_123456.csv");
    expect(buildQboR365FileName("x".repeat(40), undefined, now))
      .toBe(`${"x".repeat(30)}_20260726_123456.csv`);
  });

  it("builds parseable Invoice/CreditMemo CSVs and stable SHA-256 hashes", () => {
    const lines = [...normalize("invoice"), ...normalize("credit")];
    const first = buildR365Csv({ template: "by_item", lines });
    const second = buildR365Csv({ template: "by_item", lines: structuredClone(lines) });
    const rows = parseCsvRows(first.csv);

    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.hash).toBe(second.hash);
    expect(first.rowCount).toBe(4);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.length === 11)).toBe(true);
    expect(first.csv.split("\n")).toHaveLength(5);
  });
});

describe("QBO claim and retry rules", () => {
  const now = Date.parse("2026-07-26T12:00:00.000Z");

  it("backs off retries and moves the eighth failure to the matching review state", () => {
    expect(getQboDisconnectRetryPlan(0, "portal_pending", now)).toEqual({
      attempts: 1,
      state: "portal_pending",
      retryAt: "2026-07-26T12:01:00.000Z",
      reviewRequired: false,
    });
    expect(getQboDisconnectRetryPlan(6, "app_pending", now).retryAt).toBe("2026-07-27T12:00:00.000Z");
    expect(getQboDisconnectRetryPlan(7, "app_pending", now)).toEqual({
      attempts: 8,
      state: "app_review",
      retryAt: null,
      reviewRequired: true,
    });
    expect(getQboDisconnectRetryPlan(-10, "portal_pending", now).attempts).toBe(1);
    expect(getQboDisconnectRetryPlan(99, "portal_pending", now).state).toBe("portal_review");
  });

  it("only treats valid, non-stale timestamps as active claims", () => {
    expect(isActiveClaim("2026-07-26T11:46:00.000Z", 15 * 60_000, now)).toBe(true);
    expect(isActiveClaim("2026-07-26T11:45:00.000Z", 15 * 60_000, now)).toBe(true);
    expect(isActiveClaim("2026-07-26T11:44:59.999Z", 15 * 60_000, now)).toBe(false);
    expect(isActiveClaim(null, 15 * 60_000, now)).toBe(false);
    expect(isActiveClaim("invalid", 15 * 60_000, now)).toBe(false);
  });
});
