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
  targetCode: string;
  sourceItemCode?: string;
  sku?: string;
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
    line.targetCode,
    line.itemName ? line.itemName.split(":").pop()!.trim() : line.description,
    line.sourceLineId === "tax" ? "EACH" : (line.description || "EACH"),
    round(line.quantity),
    round(line.unitPrice),
    round(line.lineAmount),
    "",
  ];
}

export function buildR365Csv(input: {
  template: "by_item";
  lines: NormalizedInvoiceLine[];
}) {
  const headers = [
    "Vendor",
    "Location",
    "Document Number",
    "Date",
    "Vendor Item Number",
    "Vendor Item Name",
    "UofM",
    "Qty",
    "Unit Price",
    "Total",
    "Break Flag",
  ];

  const rows = input.lines.map((line) => toByItemRow(line));
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
