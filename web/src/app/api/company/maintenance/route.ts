import { NextResponse } from "next/server";

import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import {
  attachMaintenanceFiles,
  createMaintenanceRequest,
  listMaintenanceRequests,
  maintenanceCreateSchema,
} from "@/modules/maintenance/services";

function formDataToCreatePayload(formData: FormData) {
  return {
    branch_id: String(formData.get("branch_id") ?? ""),
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    category: String(formData.get("category") ?? ""),
    service_item: String(formData.get("service_item") ?? ""),
    issue: String(formData.get("issue") ?? ""),
    priority: String(formData.get("priority") ?? "medium"),
    action: String(formData.get("action") ?? "submit"),
  };
}

function filesFromFormData(formData: FormData) {
  return formData
    .getAll("files")
    .filter((value): value is File => value instanceof File && value.size > 0);
}

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("maintenance");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const branchId = url.searchParams.get("branch_id") ?? "";

  try {
    const data = await listMaintenanceRequests(
      {
        organizationId: access.tenant.organizationId,
        userId: access.userId,
        branchId: access.tenant.branchId,
        roleCode: access.tenant.roleCode,
      },
      { scope: "company", status, branchId: branchId || undefined },
    );

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al listar requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

  try {
    const context = {
      organizationId: access.tenant.organizationId,
      userId: access.userId,
      branchId: access.tenant.branchId,
      roleCode: access.tenant.roleCode,
    };
    const requestId = await createMaintenanceRequest(context, parsed.data);
    await attachMaintenanceFiles(context, requestId, filesFromFormData(formData));

    return NextResponse.json({ request: { id: requestId } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error al crear request" }, { status: 500 });
  }
}
