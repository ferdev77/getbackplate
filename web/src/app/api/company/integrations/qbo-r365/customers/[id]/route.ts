import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboCustomerById } from "@/modules/integrations/qbo-r365/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id requerido" }, { status: 400 });
  }

  try {
    const customer = await getQboCustomerById(access.tenant.organizationId, id);
    if (!customer) {
      return NextResponse.json({ error: "Cliente no encontrado en QBO" }, { status: 404 });
    }
    return NextResponse.json({ customer }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error obteniendo cliente de QBO" },
      { status: 400 },
    );
  }
}
