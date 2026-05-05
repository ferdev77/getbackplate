import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { listQboR365InvoiceHistory } from "@/modules/integrations/qbo-r365/service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  try {
    const items = await listQboR365InvoiceHistory(access.tenant.organizationId, 200, id);
    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error al cargar historial" },
      { status: 400 },
    );
  }
}
