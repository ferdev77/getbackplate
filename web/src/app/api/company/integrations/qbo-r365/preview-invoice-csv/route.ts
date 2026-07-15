import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { previewSingleInvoiceCsv } from "@/modules/integrations/qbo-r365/service";

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const sourceInvoiceId = typeof body?.sourceInvoiceId === "string" ? body.sourceInvoiceId.trim() : "";
  const syncConfigId = typeof body?.syncConfigId === "string" && body.syncConfigId.trim()
    ? body.syncConfigId.trim()
    : null;

  const templateOverride: "by_item" | null = body?.template === "by_item" ? "by_item" : null;

  if (!sourceInvoiceId) {
    return NextResponse.json({ error: "A source invoice ID is required." }, { status: 400 });
  }

  try {
    const result = await previewSingleInvoiceCsv({
      organizationId: access.tenant.organizationId,
      sourceInvoiceId,
      syncConfigId,
      templateOverride,
    });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to generate the preview. Please try again." },
      { status: 400 },
    );
  }
}
