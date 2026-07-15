import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { disconnectQboConnection } from "@/modules/integrations/qbo-r365/service";

export async function POST() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    await disconnectQboConnection({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Unable to disconnect QuickBooks. Please try again." },
      { status: 400 },
    );
  }
}
