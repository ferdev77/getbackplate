import { NextResponse } from "next/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { prepareQboR365Batch } from "@/modules/integrations/qbo-r365/service";

export async function POST() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  try {
    const result = await prepareQboR365Batch({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      triggerSource: "manual",
    });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to prepare the batch. Please try again." },
      { status: 400 },
    );
  }
}
