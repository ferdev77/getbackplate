import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboCustomerById } from "@/modules/integrations/qbo-r365/service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "A customer ID is required." }, { status: 400 });
  }

  try {
    const customer = await getQboCustomerById(access.tenant.organizationId, id);
    if (!customer) {
      return NextResponse.json({ error: "Customer not found in QuickBooks® Online." }, { status: 404 });
    }
    return NextResponse.json({ customer }, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to retrieve the QuickBooks® Online customer. Please try again." },
      { status: 400 },
    );
  }
}
