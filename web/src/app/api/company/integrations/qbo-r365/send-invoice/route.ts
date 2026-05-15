import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { sendSingleInvoiceFromHistory } from "@/modules/integrations/qbo-r365/service";

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const sourceInvoiceId = typeof body?.sourceInvoiceId === "string" ? body.sourceInvoiceId.trim() : "";
  const syncConfigId = typeof body?.syncConfigId === "string" && body.syncConfigId.trim()
    ? body.syncConfigId.trim()
    : null;

  const validTemplates = ["by_item", "by_item_service_dates", "by_account", "by_account_service_dates"] as const;
  type ValidTemplate = typeof validTemplates[number];
  const templateOverride: ValidTemplate | null = validTemplates.includes(body?.template)
    ? (body.template as ValidTemplate)
    : null;

  const ftpBody = body?.ftp;
  const ftpOverride: { host: string; port: number; username: string; password: string; remotePath: string; secure: boolean } | null =
    ftpBody && typeof ftpBody.host === "string" && ftpBody.host.trim()
      ? {
          host: String(ftpBody.host).trim(),
          port: Number(ftpBody.port ?? 21),
          username: String(ftpBody.username ?? ""),
          password: String(ftpBody.password ?? ""),
          remotePath: String(ftpBody.remotePath ?? "/APImports/R365"),
          secure: Boolean(ftpBody.secure ?? false),
        }
      : null;

  if (!sourceInvoiceId) {
    return NextResponse.json({ error: "sourceInvoiceId requerido" }, { status: 400 });
  }

  try {
    const result = await sendSingleInvoiceFromHistory({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      sourceInvoiceId,
      syncConfigId,
      ftpOverride,
      templateOverride,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar la factura" },
      { status: 400 },
    );
  }
}
