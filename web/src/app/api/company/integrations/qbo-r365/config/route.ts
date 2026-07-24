import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365Snapshot, upsertQboR365Config } from "@/modules/integrations/qbo-r365/service";

export async function GET() {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const snapshot = await getQboR365Snapshot(access.tenant.organizationId);
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Unable to load the configuration. Please try again." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const rawBody = await request.json().catch(() => null);
  try {
    const snapshot = await upsertQboR365Config({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      payload: rawBody,
    });
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Unable to save the configuration. Please try again." },
      { status: 400 },
    );
  }
}
