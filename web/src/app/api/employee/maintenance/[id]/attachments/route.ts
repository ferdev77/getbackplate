import { NextResponse } from "next/server";

import { assertEmployeeCapabilityApi } from "@/shared/lib/access";
import { attachMaintenanceFiles } from "@/modules/maintenance/services";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function filesFromFormData(formData: FormData) {
  return formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function POST(request: Request, context: RouteContext) {
  const access = await assertEmployeeCapabilityApi("maintenance", "edit");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const { id } = await context.params;

  try {
    await attachMaintenanceFiles(
      {
        organizationId: access.tenant.organizationId,
        userId: access.userId,
        branchId: access.tenant.branchId,
        roleCode: access.tenant.roleCode,
      },
      id,
      filesFromFormData(formData),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al adjuntar archivos" }, { status: 500 });
  }
}
