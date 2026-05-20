import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { listQboWebhookEvents, processPendingQboWebhookEvents } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const events = await listQboWebhookEvents(access.tenant.organizationId, limit);
  return NextResponse.json({ events }, { status: 200 });
}

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  await request.json().catch(() => ({}));
  const result = await processPendingQboWebhookEvents();
  return NextResponse.json(result, { status: 200 });
}
