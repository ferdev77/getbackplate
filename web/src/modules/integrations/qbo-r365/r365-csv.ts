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

/**
 * Parsea texto CSV respetando comillas — a diferencia de un simple split("\n"),
 * no corta una fila en pedazos cuando un campo entre comillas tiene saltos de
 * línea adentro (ej. una Description de QBO con varias líneas de texto).
 */
export function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
    } else if (ch === "\r") {
      i += 1;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}
