import { createHash } from "crypto";

export type NormalizedInvoiceLine = {
  sourceInvoiceId: string;
  sourceLineId: string;
  transactionTypeCode: "1" | "2";
  vendor: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  currency?: string;
  serviceStartDate?: string;
  serviceEndDate?: string;
  targetCode: string;
  sourceItemCode?: string;
  itemName?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  taxAmount: number;
  totalAmount: number;
  qboBalance?: number;
  qboPaymentStatus?: "paid" | "unpaid" | "partial" | "not_applicable" | "unknown";
  qboStatusRaw?: string;
  location: string;
  memo: string;
  poNumber?: string;
  terms?: string;
};

function csvEscape(value: string | number) {
  const raw = typeof value === "number" ? String(value) : value;
  if (raw.includes(",") || raw.includes("\n") || raw.includes("\r") || raw.includes('"')) {
    return `"${raw.replaceAll('"', '""')}"`;
  }
  return raw;
}

function round(num: number) {
  return Math.round(num * 100) / 100;
}

function toByItemRow(line: NormalizedInvoiceLine) {
  return [
    line.vendor,
    line.location,
    line.invoiceNumber,
    line.invoiceDate,
    line.invoiceDate,
    line.targetCode,
    line.description,
    "",
    round(line.quantity),
    round(line.unitPrice),
    round(line.lineAmount),
    "",
  ];
}

function toByItemServiceDatesRow(line: NormalizedInvoiceLine) {
  return [
    ...toByItemRow(line),
    line.serviceStartDate ?? "",
    line.serviceEndDate ?? "",
  ];
}

function toByAccountRow(line: NormalizedInvoiceLine, invoiceTotal: number) {
  return [
    line.transactionTypeCode,
    line.location,
    line.vendor,
    line.invoiceNumber,
    line.invoiceDate,
    line.invoiceDate,
    round(invoiceTotal),
    "",
    line.dueDate ?? line.invoiceDate,
    line.memo,
    line.targetCode,
    round(line.lineAmount),
    line.location,
    line.description,
  ];
}

function toByAccountServiceDatesRow(line: NormalizedInvoiceLine, invoiceTotal: number) {
  return [
    ...toByAccountRow(line, invoiceTotal),
    line.serviceStartDate ?? "",
    line.serviceEndDate ?? "",
  ];
}

export function buildR365Csv(input: {
  template: "by_item" | "by_item_service_dates" | "by_account" | "by_account_service_dates";
  lines: NormalizedInvoiceLine[];
}) {
  const headers = input.template === "by_item"
    ? [
        "Vendor",
        "Location",
        "Document Number",
        "Date",
        "Gl Date",
        "Vendor Item Number",
        "Vendor Item Name",
        "UofM",
        "Qty",
        "Unit Price",
        "Total",
        "Break Flag",
      ]
    : input.template === "by_item_service_dates"
      ? [
          "Vendor",
          "Location",
          "Document Number",
          "Date",
          "Gl Date",
          "Vendor Item Number",
          "Vendor Item Name",
          "UofM",
          "Qty",
          "Unit Price",
          "Total",
          "Break Flag",
          "Start Date of Service",
          "End Date of Service",
        ]
      : input.template === "by_account"
        ? [
            "Type",
            "Location",
            "Vendor",
            "Number",
            "Date",
            "Gl Date",
            "Amount",
            "Payment Terms",
            "Due Date",
            "Comment",
            "Detail Account",
            "Detail Amount",
            "Detail Location",
            "Detail Comment",
          ]
        : [
            "Type",
            "Location",
            "Vendor",
            "Number",
            "Date",
            "Gl Date",
            "Amount",
            "Payment Terms",
            "Due Date",
            "Comment",
            "Detail Account",
            "Detail Amount",
            "Detail Location",
            "Detail Comment",
            "Start Date of Service",
            "End Date of Service",
          ];

  const invoiceTotalsById = new Map<string, number>();
  if (input.template === "by_account" || input.template === "by_account_service_dates") {
    for (const line of input.lines) {
      invoiceTotalsById.set(
        line.sourceInvoiceId,
        Number(invoiceTotalsById.get(line.sourceInvoiceId) ?? 0) + Number(line.totalAmount ?? 0),
      );
    }
  }

  const rows = input.lines.map((line) => {
    if (input.template === "by_item") {
      return toByItemRow(line);
    }
    if (input.template === "by_item_service_dates") {
      return toByItemServiceDatesRow(line);
    }
    if (input.template === "by_account") {
      return toByAccountRow(line, Number(invoiceTotalsById.get(line.sourceInvoiceId) ?? line.totalAmount));
    }
    return toByAccountServiceDatesRow(line, Number(invoiceTotalsById.get(line.sourceInvoiceId) ?? line.totalAmount));
  });
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n");

  const hash = createHash("sha256").update(csv, "utf8").digest("hex");
  return {
    csv,
    hash,
    rowCount: rows.length,
  };
}
