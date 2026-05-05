import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { deleteSyncConfig, listSyncConfigs, updateSyncConfig } from "@/modules/integrations/qbo-r365/service";
import { syncConfigUpdateSchema } from "@/modules/integrations/qbo-r365/types";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  try {
    const configs = await listSyncConfigs(access.tenant.organizationId);
    const config = configs.find((c) => c.id === id);
    if (!config) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    return NextResponse.json({ config }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const parsed = syncConfigUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await updateSyncConfig(access.tenant.organizationId, id, access.userId, parsed.data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar" },
      { status: 400 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  try {
    await deleteSyncConfig(access.tenant.organizationId, id);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar" },
      { status: 400 },
    );
  }
}
