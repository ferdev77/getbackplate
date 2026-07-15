import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365RunPreview } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 50;

  if (!runId) {
    return NextResponse.json({ error: "A run ID is required." }, { status: 400 });
  }

  try {
    const preview = await getQboR365RunPreview({
      organizationId: access.tenant.organizationId,
      runId,
      limit,
    });
    return NextResponse.json(preview, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to load the preview. Please try again." },
      { status: 400 },
    );
  }
}
