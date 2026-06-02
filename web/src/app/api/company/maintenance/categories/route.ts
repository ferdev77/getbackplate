import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { createMaintenanceCategory, getMaintenanceCatalog } from "@/modules/maintenance/services";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export async function GET() {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const catalog = await getMaintenanceCatalog(access.tenant.organizationId);
  return NextResponse.json({ categories: catalog.categories });
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
    const category = await createMaintenanceCategory({
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      branchId: access.tenant.branchId,
      roleCode: access.tenant.roleCode,
    }, parsed.data);

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo crear la categoria" }, { status: 400 });
  }
}
