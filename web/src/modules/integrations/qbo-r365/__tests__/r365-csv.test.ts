import { describe, it, expect } from "vitest";
import { buildR365Csv, parseCsvRows, type NormalizedInvoiceLine } from "../r365-csv";

function makeLine(overrides: Partial<NormalizedInvoiceLine> = {}): NormalizedInvoiceLine {
  return {
    sourceInvoiceId: "inv-1",
    sourceLineId: "1",
    transactionTypeCode: "1",
    vendor: "PRODEL DISTRIBUTION INC",
    invoiceNumber: "51404",
    invoiceDate: "2026-06-20",
    targetCode: "ITEM-1",
    description: "500 Units",
    quantity: 1,
    unitPrice: 1.99,
    lineAmount: 1.99,
    taxAmount: 0,
    totalAmount: 1.99,
    location: "10001902",
    memo: "",
    ...overrides,
  };
}

describe("parseCsvRows", () => {
  it("una fila simple sin comillas se parsea en sus columnas", () => {
    const rows = parseCsvRows("a,b,c\n1,2,3");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("un campo entre comillas con saltos de línea adentro no rompe la fila en pedazos", () => {
    const csv = 'a,b,c\n1,"linea uno\n\nlinea dos",3';
    const rows = parseCsvRows(csv);
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "linea uno\n\nlinea dos", "3"],
    ]);
  });

  it("comillas dobles escapadas dentro de un campo se decodifican a una sola comilla", () => {
    const rows = parseCsvRows('a,b\n1,"dijo ""hola"""');
    expect(rows).toEqual([["a", "b"], ["1", 'dijo "hola"']]);
  });
});

describe("buildR365Csv + parseCsvRows (roundtrip)", () => {
  it("una descripción larga con varios saltos de línea sigue siendo 1 sola fila de 11 columnas", () => {
    const line = makeLine({
      description: "If you receive this test invoice please confirm at 956-664-1344 or via email at admin@prodeldisribution.com\n\nRegards,\nMartha Marroquin",
    });
    const { csv } = buildR365Csv({ template: "by_item", lines: [line] });
    const [header, ...rows] = parseCsvRows(csv);

    expect(header).toHaveLength(11);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(11);
  });

  it("una descripción corta (caso real de Kumori) tambien produce 1 fila de 11 columnas", () => {
    const line = makeLine({ description: "500 Units" });
    const { csv } = buildR365Csv({ template: "by_item", lines: [line] });
    const [header, ...rows] = parseCsvRows(csv);

    expect(header).toHaveLength(11);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(11);
    expect(rows[0][6]).toBe("500 Units");
  });
});
