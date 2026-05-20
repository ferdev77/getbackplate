import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { importQboWebhookEventManually } from "@/modules/integrations/qbo-r365/service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const params = await context.params;
  const id = params.id?.trim();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  const result = await importQboWebhookEventManually({
    organizationId: access.tenant.organizationId,
    actorId: access.userId,
    eventId: id,
  });
  return NextResponse.json(result, { status: 200 });
}
