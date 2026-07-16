import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { buildQboOAuthStartUrl } from "@/modules/integrations/qbo-r365/service";

export async function GET() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const authorizeUrl = await buildQboOAuthStartUrl({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
    });

    return NextResponse.json({ authorizeUrl });
  } catch {
    return NextResponse.json(
      { error: "Unable to start QuickBooks® Online authorization. Please try again." },
      { status: 400 },
    );
  }
}
