import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { sendSingleUnifiedInvoice } from "@/modules/integrations/qbo-r365/service";

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
    const result = await sendSingleUnifiedInvoice({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      unifiedInvoiceId: parsed.data.unifiedInvoiceId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar la factura" },
      { status: 400 },
    );
  }
}
