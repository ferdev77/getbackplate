import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { listQboCustomers } from "@/modules/integrations/qbo-r365/service";

export async function GET() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const customers = await listQboCustomers(access.tenant.organizationId);
    return NextResponse.json({ customers }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to load QuickBooks® Online customers. Please try again." },
      { status: 400 },
    );
  }
}
