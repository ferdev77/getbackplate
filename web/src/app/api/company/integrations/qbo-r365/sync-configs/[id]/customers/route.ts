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
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = syncConfigAddCustomerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await addCustomerToSyncConfig(access.tenant.organizationId, id, access.userId, parsed.data.id, parsed.data.name);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo agregar el cliente";
    const status = message.includes("ya está asignado") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
