import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { listQboR365Runs } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

  try {
    const runs = await listQboR365Runs(access.tenant.organizationId, limit);
    return NextResponse.json({ runs });
  } catch {
    return NextResponse.json(
      { error: "Unable to load the run history. Please try again." },
      { status: 500 },
    );
  }
}
