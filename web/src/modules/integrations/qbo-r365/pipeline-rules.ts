import type { QboInvoiceLike } from "./qbo-client";
import type { NormalizedInvoiceLine } from "./r365-csv";

export type QboR365Mapping = {
  target_field: string;
  source_field: string | null;
  transform_rule: Record<string, unknown>;
};

function readPath(obj: Record<string, unknown>, path: string) {
  const segments = path.split(".").map((part) => part.trim()).filter(Boolean);
  let current: unknown = obj;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function applyMappings(
  line: NormalizedInvoiceLine,
  mappings: QboR365Mapping[],
  sourceData: Record<string, unknown>,
) {
  if (mappings.length === 0) return line;

  const next = { ...line };
  for (const mapping of mappings) {
    const transform = mapping.transform_rule ?? {};
    let value: unknown = mapping.source_field ? readPath(sourceData, mapping.source_field) : null;
    if ((value === null || value === undefined || value === "") && transform.default !== undefined) {
      value = transform.default;
    }
    if (typeof value === "string") {
      if (transform.uppercase === true) value = value.toUpperCase();
      if (typeof transform.prefix === "string") value = `${transform.prefix}${value}`;
      if (typeof transform.suffix === "string") value = `${value}${transform.suffix}`;
    }
    if (value === null || value === undefined) continue;

    if (mapping.target_field === "targetCode" || mapping.target_field === "target_code") next.targetCode = String(value);
    else if (mapping.target_field === "description") next.description = String(value);
    else if (mapping.target_field === "vendor") next.vendor = String(value);
    else if (mapping.target_field === "location") next.location = String(value);
    else if (mapping.target_field === "memo") next.memo = String(value);
  }
  return next;
}

export function normalizeQboRows(input: {
  invoices: QboInvoiceLike[];
  salesReceipts: QboInvoiceLike[];
  creditMemos: QboInvoiceLike[];
  template: "by_item";
  taxMode: "line" | "header" | "none";
  mappings: QboR365Mapping[];
  itemSkuMap?: Map<string, string>;
  customerAcctNumMap?: Map<string, string>;
  syncConfigCustomerId?: string;
  r365VendorName?: string;
  r365Location?: string;
  taxItemNumber?: string;
  invoiceTotalsOut?: Map<string, number>;
  today?: string;
}) {
  const all = [
    ...input.invoices.map((data) => ({ kind: "invoice" as const, data })),
    ...input.salesReceipts.map((data) => ({ kind: "sales_receipt" as const, data })),
    ...input.creditMemos.map((data) => ({ kind: "credit" as const, data })),
  ];
  const lines: NormalizedInvoiceLine[] = [];

  for (const row of all) {
    const invoiceId = row.data.Id ?? "unknown_invoice";
    const vendor = input.r365VendorName?.trim() || row.data.CustomerRef?.name || row.data.CustomerRef?.value || "UNKNOWN_CUSTOMER";
    const invoiceNumber = row.data.DocNumber || `QBO-${invoiceId}`;
    const invoiceDate = row.data.TxnDate || input.today || new Date().toISOString().slice(0, 10);
    const totalAmount = Number(row.data.TotalAmt ?? 0);
    input.invoiceTotalsOut?.set(invoiceId, row.kind === "credit" ? -totalAmount : totalAmount);
    const balanceAmount = Number(row.data.Balance ?? Number.NaN);
    const qboPaymentStatus: NormalizedInvoiceLine["qboPaymentStatus"] = row.kind === "credit"
      ? "not_applicable"
      : row.kind === "sales_receipt"
        ? "paid"
        : Number.isFinite(balanceAmount)
          ? (balanceAmount <= 0 ? "paid" : (balanceAmount < totalAmount ? "partial" : "unpaid"))
          : "unknown";
    const rawStatus = (row.data as unknown as Record<string, unknown>).TxnStatus;
    const qboStatusRaw = typeof rawStatus === "string" && rawStatus.trim()
      ? rawStatus.trim()
      : row.kind === "credit" ? "Credit Memo"
        : row.kind === "sales_receipt" || qboPaymentStatus === "paid" ? "Paid"
          : qboPaymentStatus === "partial" ? "Partially Paid"
            : qboPaymentStatus === "unpaid" ? "Open" : "Unknown";
    const headerTax = Number(row.data.TxnTaxDetail?.TotalTax ?? 0);
    const itemLines = (row.data.Line ?? []).filter((line) =>
      line.DetailType === "SalesItemLineDetail" || line.DetailType === "AccountBasedExpenseLineDetail");
    const baseAmountSum = itemLines.reduce((sum, line) => sum + Number(line.Amount ?? 0), 0);
    const csvSign = row.kind === "credit" ? -1 : 1;

    for (let index = 0; index < itemLines.length; index += 1) {
      const line = itemLines[index];
      const lineAmount = Number(line.Amount ?? 0);
      const qty = Number(line.SalesItemLineDetail?.Qty ?? 1);
      const unitPrice = Number(line.SalesItemLineDetail?.UnitPrice ?? (qty > 0 ? lineAmount / qty : lineAmount));
      const sourceItemCode = line.SalesItemLineDetail?.ItemRef?.value || line.AccountBasedExpenseLineDetail?.AccountRef?.value || "";
      const mappedSku = sourceItemCode ? input.itemSkuMap?.get(sourceItemCode) : undefined;
      const targetCode = mappedSku || line.SalesItemLineDetail?.ItemRef?.name || `UNMAPPED-${sourceItemCode || "ITEM"}`;
      const explicitLineTax = Number(line.TaxAmount ?? line.SalesItemLineDetail?.TaxAmount ?? line.AccountBasedExpenseLineDetail?.TaxAmount ?? 0);
      const proportionalTax = baseAmountSum > 0 ? (lineAmount / baseAmountSum) * headerTax : 0;
      const taxAmount = input.taxMode === "none" ? 0 : input.taxMode === "line" ? (explicitLineTax || proportionalTax) : proportionalTax;
      const lineTotalAmount = lineAmount + taxAmount;

      lines.push(applyMappings({
        sourceInvoiceId: invoiceId,
        sourceLineId: line.Id || String(index + 1),
        transactionTypeCode: row.kind === "credit" ? "2" : "1",
        vendor,
        invoiceNumber,
        invoiceDate,
        dueDate: row.data.DueDate || invoiceDate,
        currency: row.data.CurrencyRef?.name || row.data.CurrencyRef?.value || "",
        targetCode,
        sourceItemCode,
        sku: mappedSku || "",
        itemName: line.SalesItemLineDetail?.ItemRef?.name || line.AccountBasedExpenseLineDetail?.AccountRef?.name || "",
        description: line.Description || "",
        quantity: Number.isFinite(qty) ? qty : 1,
        unitPrice: csvSign * (Number.isFinite(unitPrice) ? unitPrice : lineAmount),
        lineAmount: csvSign * lineAmount,
        taxAmount,
        totalAmount: csvSign * (Number.isFinite(lineTotalAmount) ? lineTotalAmount : (Number.isFinite(totalAmount) ? totalAmount : lineAmount)),
        qboBalance: Number.isFinite(balanceAmount) ? balanceAmount : undefined,
        qboPaymentStatus,
        qboStatusRaw,
        location: input.r365Location?.trim()
          || input.customerAcctNumMap?.get(String(row.data.CustomerRef?.value ?? ""))
          || (input.syncConfigCustomerId ? input.customerAcctNumMap?.get(input.syncConfigCustomerId) : undefined)
          || "",
        memo: row.data.PrivateNote || "",
        poNumber: row.data.PONumber || "",
        terms: row.data.SalesTermRef?.name || "",
      }, input.mappings, { invoice: row.data as unknown as Record<string, unknown>, line: line as unknown as Record<string, unknown> }));
    }

    if (headerTax > 0) {
      lines.push(applyMappings({
        sourceInvoiceId: invoiceId,
        sourceLineId: "tax",
        transactionTypeCode: row.kind === "credit" ? "2" : "1",
        vendor,
        invoiceNumber,
        invoiceDate,
        dueDate: row.data.DueDate || invoiceDate,
        currency: row.data.CurrencyRef?.name || row.data.CurrencyRef?.value || "",
        targetCode: input.taxItemNumber || "999999",
        sourceItemCode: "",
        sku: "",
        itemName: "Tax",
        description: "Tax",
        quantity: 1,
        unitPrice: csvSign * headerTax,
        lineAmount: csvSign * headerTax,
        taxAmount: 0,
        totalAmount: csvSign * headerTax,
        qboBalance: undefined,
        qboPaymentStatus: "not_applicable",
        qboStatusRaw: undefined,
        location: input.r365Location?.trim()
          || input.customerAcctNumMap?.get(String(row.data.CustomerRef?.value ?? ""))
          || (input.syncConfigCustomerId ? input.customerAcctNumMap?.get(input.syncConfigCustomerId) : undefined)
          || "",
        memo: "",
        poNumber: "",
        terms: "",
      }, input.mappings, { invoice: row.data as unknown as Record<string, unknown>, line: {} }));
    }
  }
  return lines;
}

export function buildQboR365DedupeKey(line: NormalizedInvoiceLine) {
  return `${line.sourceInvoiceId}:${line.sourceLineId}:${line.transactionTypeCode}:${line.lineAmount}:${line.targetCode}`;
}

export function buildQboR365FileName(prefix: string, invoiceNumber?: string, now = new Date()) {
  const iso = now.toISOString();
  const date = iso.slice(0, 10).replaceAll("-", "");
  const time = iso.slice(11, 19).replaceAll(":", "");
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 30);
  if (!invoiceNumber) return `${safePrefix}_${date}_${time}.csv`;
  const safeInvoice = invoiceNumber.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 20);
  return `${safePrefix}_INV${safeInvoice}_${date}_${time}.csv`;
}

const DISCONNECT_RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

export function getQboDisconnectRetryPlan(currentAttempts: number, state: "portal_pending" | "app_pending", now = Date.now()) {
  const attempts = Math.max(0, Number(currentAttempts) || 0) + 1;
  const reviewRequired = attempts >= 8;
  const delay = DISCONNECT_RETRY_DELAYS_MS[Math.min(attempts - 1, DISCONNECT_RETRY_DELAYS_MS.length - 1)];
  return {
    attempts,
    state: reviewRequired ? (state === "app_pending" ? "app_review" as const : "portal_review" as const) : state,
    retryAt: reviewRequired ? null : new Date(now + delay).toISOString(),
    reviewRequired,
  };
}

export function isActiveClaim(claimedAt: string | null, staleAfterMs: number, now = Date.now()) {
  if (!claimedAt) return false;
  const timestamp = new Date(claimedAt).getTime();
  return Number.isFinite(timestamp) && timestamp >= now - staleAfterMs;
}
