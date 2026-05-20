import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { fetchInvoiceByDocNumber } from "@/modules/integrations/qbo-r365/service";

const bodySchema = z.object({
  docNumber: z.string().trim().min(1).max(100),
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
    const result = await fetchInvoiceByDocNumber(access.tenant.organizationId, parsed.data.docNumber);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo traer la factura" },
      { status: 400 },
    );
  }
}
