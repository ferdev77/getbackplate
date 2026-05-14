import { NextRequest, NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getInvoiceDetail } from "@/modules/integrations/qbo-r365/service";

export async function GET(req: NextRequest) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const sourceInvoiceId = req.nextUrl.searchParams.get("sourceInvoiceId");
  if (!sourceInvoiceId) {
    return NextResponse.json({ error: "sourceInvoiceId requerido" }, { status: 400 });
  }

  try {
    const detail = await getInvoiceDetail(access.tenant.organizationId, sourceInvoiceId);
    if (!detail) {
      return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al cargar detalle de factura" },
      { status: 500 },
    );
  }
}
