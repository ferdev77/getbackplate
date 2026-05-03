import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365RunPreview } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId") ?? "";
  const limitRaw = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 50;

  if (!runId) {
    return NextResponse.json({ error: "runId es requerido" }, { status: 400 });
  }

  try {
    const preview = await getQboR365RunPreview({
      organizationId: access.tenant.organizationId,
      runId,
      limit,
    });
    return NextResponse.json(preview, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo obtener preview" },
      { status: 400 },
    );
  }
}
