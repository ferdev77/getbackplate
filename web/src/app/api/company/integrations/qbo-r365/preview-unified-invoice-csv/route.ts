/**
 * POST /api/company/integrations/qbo-r365/preview-unified-invoice-csv
 *
 * Genera la previsualización del CSV R365 para una factura del historial unificado
 * (qbo_unified_invoices). Lee el raw_entity almacenado, corre normalizeQboRows,
 * construye el CSV y devuelve headers + filas parseadas para mostrar en el dashboard.
 *
 * Body: { unifiedInvoiceId: string (UUID) }
 * Response: { headers, rows, csv, rowCount, templateUsed }
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { previewUnifiedInvoiceCsv } from "@/modules/integrations/qbo-r365/service";

const bodySchema = z.object({
  unifiedInvoiceId: z.string().trim().uuid(),
});

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await previewUnifiedInvoiceCsv({
      organizationId: access.tenant.organizationId,
      unifiedInvoiceId: parsed.data.unifiedInvoiceId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar la previsualización" },
      { status: 400 },
    );
  }
}
