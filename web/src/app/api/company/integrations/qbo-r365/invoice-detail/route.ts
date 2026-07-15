import { NextRequest, NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getInvoiceDetail } from "@/modules/integrations/qbo-r365/service";

export async function GET(req: NextRequest) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const sourceInvoiceId = req.nextUrl.searchParams.get("sourceInvoiceId");
  if (!sourceInvoiceId) {
    return NextResponse.json({ error: "A source invoice ID is required." }, { status: 400 });
  }

  try {
    const detail = await getInvoiceDetail(access.tenant.organizationId, sourceInvoiceId);
    if (!detail) {
      return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    }
    return NextResponse.json({ detail });
  } catch {
    return NextResponse.json(
      { error: "Unable to load the invoice details. Please try again." },
      { status: 500 },
    );
  }
}
