import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { buildQboOAuthStartUrl } from "@/modules/integrations/qbo-r365/service";

export async function GET() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const authorizeUrl = await buildQboOAuthStartUrl({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
    });

    return NextResponse.json({ authorizeUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo construir URL OAuth" },
      { status: 400 },
    );
  }
}
