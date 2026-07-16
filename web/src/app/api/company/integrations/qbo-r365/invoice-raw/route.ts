import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { fetchRawQboInvoice } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get("invoiceId");
  if (!invoiceId) {
    return NextResponse.json({ error: "An invoice ID is required." }, { status: 400 });
  }

  try {
    const result = await fetchRawQboInvoice(access.tenant.organizationId, invoiceId);
    if (!result) {
      return NextResponse.json({ error: "Invoice not found in QuickBooks® Online." }, { status: 404 });
    }
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to retrieve the invoice. Please try again." },
      { status: 400 },
    );
  }
}
