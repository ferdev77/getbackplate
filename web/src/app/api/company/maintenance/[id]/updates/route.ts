import { NextResponse } from "next/server";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { addMaintenanceUpdate, maintenanceUpdateSchema } from "@/modules/maintenance/services";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = maintenanceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;

  try {
    await addMaintenanceUpdate(
      {
        organizationId: access.tenant.organizationId,
        userId: access.userId,
        branchId: access.tenant.branchId,
        roleCode: access.tenant.roleCode,
      },
      id,
      parsed.data,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al responder request" }, { status: 500 });
  }
}
