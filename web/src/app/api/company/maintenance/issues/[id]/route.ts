import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { deleteMaintenanceIssueTemplate, updateMaintenanceIssueTemplate } from "@/modules/maintenance/services";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 422 });
  }

  try {
    const { id } = await params;
    const issue = await updateMaintenanceIssueTemplate({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      branchId: access.tenant.branchId,
      roleCode: access.tenant.roleCode,
    }, id, parsed.data);

    return NextResponse.json({ issue });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar el issue" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const { id } = await params;
    await deleteMaintenanceIssueTemplate({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      branchId: access.tenant.branchId,
      roleCode: access.tenant.roleCode,
    }, id);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo eliminar el issue" }, { status: 400 });
  }
}
