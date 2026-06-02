import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { createMaintenanceServiceItem, getMaintenanceCatalog } from "@/modules/maintenance/services";

const createSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export async function GET() {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const catalog = await getMaintenanceCatalog(access.tenant.organizationId);
  return NextResponse.json({ serviceItems: catalog.serviceItems });
}

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos" }, { status: 422 });
  }

  try {
    const serviceItem = await createMaintenanceServiceItem({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      branchId: access.tenant.branchId,
      roleCode: access.tenant.roleCode,
    }, parsed.data.categoryId, { name: parsed.data.name });

    return NextResponse.json({ serviceItem }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear el item" }, { status: 400 });
  }
}
