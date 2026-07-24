/**
 * POST /api/company/integrations/qbo-r365/sync-configs/[id]/customers
 *   Agrega un cliente QBO (sucursal) al grupo de una sync config existente.
 *   No consume un slot nuevo — el slot ya fue consumido al crear la sync config.
 *   409 si el cliente ya está asignado a otra sincronización.
 */
import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { addCustomerToSyncConfig } from "@/modules/integrations/qbo-r365/service";
import { syncConfigAddCustomerSchema } from "@/modules/integrations/qbo-r365/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = syncConfigAddCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "The request is invalid." }, { status: 400 });
  }

  try {
    await addCustomerToSyncConfig(access.tenant.organizationId, id, access.userId, parsed.data.id, parsed.data.name);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.message.includes("already assigned") ? 409 : 400;
    return NextResponse.json({ error: "Unable to add the customer. Please try again." }, { status });
  }
}
