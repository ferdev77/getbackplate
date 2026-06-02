import { NextResponse } from "next/server";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import {
  attachMaintenanceFiles,
  maintenanceCreateSchema,
  updateMaintenanceDraft,
} from "@/modules/maintenance/services";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function formDataToCreatePayload(formData: FormData) {
  return {
    branch_id: String(formData.get("branch_id") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    service_item: String(formData.get("service_item") ?? ""),
    issue: String(formData.get("issue") ?? ""),
    priority: String(formData.get("priority") ?? "medium"),
    action: String(formData.get("action") ?? "draft"),
  };
}

function filesFromFormData(formData: FormData) {
  return formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function PUT(request: Request, context: RouteContext) {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Solicitud invalida" }, { status: 400 });
  }

  const parsed = maintenanceCreateSchema.safeParse(formDataToCreatePayload(formData));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos invalidos", details: parsed.error.flatten() }, { status: 422 });
  }

  const { id } = await context.params;

  try {
    const actorContext = {
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      branchId: access.tenant.branchId,
      roleCode: access.tenant.roleCode,
    };

    await updateMaintenanceDraft(actorContext, id, parsed.data);
    await attachMaintenanceFiles(actorContext, id, filesFromFormData(formData));

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al actualizar borrador" }, { status: 500 });
  }
}
