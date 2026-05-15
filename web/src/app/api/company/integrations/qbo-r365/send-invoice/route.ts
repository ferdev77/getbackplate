import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { sendSingleInvoiceFromHistory } from "@/modules/integrations/qbo-r365/service";

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const sourceInvoiceId = typeof body?.sourceInvoiceId === "string" ? body.sourceInvoiceId.trim() : "";
  const syncConfigId = typeof body?.syncConfigId === "string" && body.syncConfigId.trim()
    ? body.syncConfigId.trim()
    : null;

  if (!sourceInvoiceId) {
    return NextResponse.json({ error: "sourceInvoiceId requerido" }, { status: 400 });
  }

  try {
    const result = await sendSingleInvoiceFromHistory({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      sourceInvoiceId,
      syncConfigId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar la factura" },
      { status: 400 },
    );
  }
}
