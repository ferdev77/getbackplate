import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { buildQboOAuthStartUrl } from "@/modules/integrations/qbo-r365/service";
import { getRequestOrigin } from "@/shared/lib/app-url";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const authorizeUrl = await buildQboOAuthStartUrl({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      returnOrigin: getRequestOrigin(request),
    });

    return NextResponse.json({ authorizeUrl });
  } catch {
    return NextResponse.json(
      { error: "Unable to start QuickBooks® Online authorization. Please try again." },
      { status: 400 },
    );
  }
}
