import { NextRequest, NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { listUnifiedHistory } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: NextRequest) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? "100"), 500));
  const syncConfigId = searchParams.get("syncConfigId") ?? null;

  try {
    const rows = await listUnifiedHistory(access.tenant.organizationId, limit, syncConfigId);
    return NextResponse.json({ rows }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el historial unificado" },
      { status: 400 },
    );
  }
}
