import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { backfillSyncConfigToUnified } from "@/modules/integrations/qbo-r365/service";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;

  try {
    const result = await backfillSyncConfigToUnified(access.tenant.organizationId, id);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar el backfill" },
      { status: 400 },
    );
  }
}
