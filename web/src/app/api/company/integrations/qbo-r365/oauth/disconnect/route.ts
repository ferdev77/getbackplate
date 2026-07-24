import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { disconnectQboConnection } from "@/modules/integrations/qbo-r365/service";

export async function POST() {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const result = await disconnectQboConnection({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
    });

    return NextResponse.json(
      { ok: true, ...result },
      { status: result.state === "disconnected" ? 200 : 202 },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to disconnect QuickBooks® Online. Please try again." },
      { status: 400 },
    );
  }
}
