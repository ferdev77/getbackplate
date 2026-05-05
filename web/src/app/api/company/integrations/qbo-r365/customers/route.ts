import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { listQboCustomers } from "@/modules/integrations/qbo-r365/service";

export async function GET() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const customers = await listQboCustomers(access.tenant.organizationId);
    return NextResponse.json({ customers }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los clientes de QBO" },
      { status: 400 },
    );
  }
}
