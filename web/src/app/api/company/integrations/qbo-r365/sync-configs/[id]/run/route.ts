import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { runQboR365Sync } from "@/modules/integrations/qbo-r365/service";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const body = await _req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  try {
    const result = await runQboR365Sync({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      triggerSource: "manual",
      syncConfigId: id,
      dryRun,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar la sincronizacion" },
      { status: 400 },
    );
  }
}
