import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getQboR365Snapshot, upsertQboR365Config } from "@/modules/integrations/qbo-r365/service";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const url = new URL(request.url);
    const wantsSensitive = url.searchParams.get("includeSensitive") === "1";
    const includeSensitive = wantsSensitive && process.env.NODE_ENV !== "production";

    const snapshot = await getQboR365Snapshot(access.tenant.organizationId, { includeSensitive });
    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json(
      { error: "Unable to load the configuration. Please try again." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
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
