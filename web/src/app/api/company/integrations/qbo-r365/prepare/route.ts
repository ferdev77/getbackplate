import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { prepareQboR365Batch } from "@/modules/integrations/qbo-r365/service";

export async function POST() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await prepareQboR365Batch({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      triggerSource: "manual",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo preparar lote" },
      { status: 400 },
    );
  }
}
