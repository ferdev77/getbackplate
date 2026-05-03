import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { runQboR365Sync } from "@/modules/integrations/qbo-r365/service";

const syncRequestSchema = z.object({
  dryRun: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido" }, { status: 400 });
  }

  try {
    const result = await runQboR365Sync({
      organizationId: access.tenant.organizationId,
      actorId: access.userId,
      dryRun: parsed.data.dryRun,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar sincronizacion" },
      { status: 400 },
    );
  }
}
