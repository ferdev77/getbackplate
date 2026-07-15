import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { sendPreparedQboR365Run } from "@/modules/integrations/qbo-r365/service";

const schema = z.object({
  runId: z.string().uuid(),
});

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "The request is invalid." }, { status: 400 });
  }

  try {
    const result = await sendPreparedQboR365Run({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      runId: parsed.data.runId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Unable to send the batch. Please try again." },
      { status: 400 },
    );
  }
}
