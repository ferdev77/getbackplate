/**
 * DELETE /api/company/integrations/qbo-r365/sync-configs/[id]/customers/[customerId]
 *   Quita un cliente QBO (sucursal) del grupo. 400 si es el único cliente del grupo
 *   (no se puede vaciar la sync config — hay que eliminarla completa).
 */
import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { removeCustomerFromSyncConfig } from "@/modules/integrations/qbo-r365/service";

type Params = { params: Promise<{ id: string; customerId: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id, customerId } = await params;

  try {
    await removeCustomerFromSyncConfig(access.tenant.organizationId, id, customerId);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo quitar el cliente" },
      { status: 400 },
    );
  }
}
