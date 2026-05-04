import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365RunExport } from "@/modules/integrations/qbo-r365/service";

type ExportFormat = "raw" | "json" | "csv" | "txt";

function escapeCsv(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(escapeCsv).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function toTxt(rows: Array<Record<string, unknown>>) {
  return rows
    .map((row, idx) => {
      const pairs = Object.entries(row).map(([key, value]) => `${key}: ${value ?? ""}`);
      return [`#${idx + 1}`, ...pairs].join("\n");
    })
    .join("\n\n");
}

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  const format = (url.searchParams.get("format") ?? "json") as ExportFormat;

  if (!runId) {
    return NextResponse.json({ error: "runId es requerido" }, { status: 400 });
  }

  if (!["raw", "json", "csv", "txt"].includes(format)) {
    return NextResponse.json({ error: "Formato no soportado" }, { status: 400 });
  }

  try {
    const exportData = await getQboR365RunExport({
      organizationId: access.tenant.organizationId,
      runId,
    });

    const flattenedRows = exportData.rows.map((row) => ({
      status: row.status,
      mappingMode: row.mappingMode ?? "",
      sourceInvoiceId: row.sourceInvoiceId,
      sourceLineId: row.sourceLineId,
      dedupeKey: row.dedupeKey,
      rawVendor: row.raw.vendor,
      rawInvoiceNumber: row.raw.invoiceNumber,
      rawDescription: row.raw.description,
      rawAmount: row.raw.amount,
      vendor: row.mapped.vendor,
      invoiceNumber: row.mapped.invoiceNumber,
      invoiceDate: (row.payload.invoiceDate as string | undefined) ?? "",
      dueDate: (row.payload.dueDate as string | undefined) ?? "",
      currency: (row.payload.currency as string | undefined) ?? "",
      targetCode: row.mapped.targetCode,
      description: row.mapped.description,
      quantity: row.mapped.quantity,
      unitPrice: row.mapped.unitPrice,
      lineAmount: row.mapped.lineAmount,
      taxAmount: row.mapped.taxAmount,
      totalAmount: row.mapped.totalAmount,
    }));
    const invoicesCount = new Set(flattenedRows.map((row) => String(row.sourceInvoiceId ?? "")).filter(Boolean)).size;
    const linesCount = flattenedRows.length;

    let body = "";
    let contentType = "application/json; charset=utf-8";
    let extension = "json";

    if (format === "raw") {
      body = JSON.stringify({
        runId: exportData.runId,
        startedAt: exportData.startedAt,
        mappingMode: exportData.mappingMode,
        rows: exportData.rows.map((row) => row.payload),
      }, null, 2);
      extension = "raw.json";
    } else if (format === "json") {
      body = JSON.stringify({
        runId: exportData.runId,
        startedAt: exportData.startedAt,
        mappingMode: exportData.mappingMode,
        rows: flattenedRows,
      }, null, 2);
      extension = "json";
    } else if (format === "csv") {
      body = toCsv(flattenedRows);
      contentType = "text/csv; charset=utf-8";
      extension = "csv";
    } else {
      body = toTxt(flattenedRows);
      contentType = "text/plain; charset=utf-8";
      extension = "txt";
    }

    const fileName = `qbo-r365-${runId.slice(0, 8)}-${format}.${extension}`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "content-disposition": `attachment; filename=\"${fileName}\"`,
        "cache-control": "no-store",
        "x-qbo-invoices-count": String(invoicesCount),
        "x-qbo-lines-count": String(linesCount),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo exportar" },
      { status: 400 },
    );
  }
}
