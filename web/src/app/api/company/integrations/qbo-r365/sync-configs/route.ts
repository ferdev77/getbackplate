import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { createSyncConfig, listSyncConfigs } from "@/modules/integrations/qbo-r365/service";
import { syncConfigCreateSchema } from "@/modules/integrations/qbo-r365/types";

const syncConfigCreateDeveloperSchema = syncConfigCreateSchema.extend({
  r365FtpHost: z.string().trim().max(255).optional().default(""),
  r365FtpPort: z.number().int().min(1).max(65535).optional().default(21),
  r365FtpUsername: z.string().trim().max(255).optional().default(""),
  r365FtpPassword: z.string().trim().max(500).optional().default(""),
  r365FtpRemotePath: z.string().trim().max(500).optional().default("/APImports/R365"),
  r365FtpSecure: z.boolean().optional().default(false),
});

export async function GET() {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const configs = await listSyncConfigs(access.tenant.organizationId);
    return NextResponse.json({ configs }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las sincronizaciones" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = await request.json().catch(() => ({}));
  const developerMode = body?.developerMode === true;
  const parsed = (developerMode ? syncConfigCreateDeveloperSchema : syncConfigCreateSchema).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const id = await createSyncConfig(access.tenant.organizationId, access.userId, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la sincronizacion" },
      { status: 400 },
    );
  }
}
