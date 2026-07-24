/**
 * POST /api/company/integrations/qbo-r365/map-unified-invoice
 *
 * Ejecuta solo el paso de mapping sobre una factura del historial unificado:
 * normaliza el raw_entity y avanza pipeline_status a 'mapeada'. Sin FTP.
 *
 * Body: { unifiedInvoiceId: string (UUID) }
 * Response: { mapped: number }  — cantidad de líneas mapeadas
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { mapOnlyUnifiedInvoice } from "@/modules/integrations/qbo-r365/service";

const bodySchema = z.object({
  unifiedInvoiceId: z.string().trim().uuid(),
});

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "The request is invalid." }, { status: 400 });
  }

  try {
    const result = await mapOnlyUnifiedInvoice({
      organizationId: access.tenant.organizationId,
      unifiedInvoiceId: parsed.data.unifiedInvoiceId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to map the invoice. Please try again." },
      { status: 400 },
    );
  }
}
