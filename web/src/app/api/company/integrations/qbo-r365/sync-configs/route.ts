/**
 * GET  /api/company/integrations/qbo-r365/sync-configs
 *   Lista las sync configs de la organización.
 *
 * POST /api/company/integrations/qbo-r365/sync-configs
 *   Crea una sync config (1 slot). El body acepta `qboCustomers: [{id, name}, ...]`
 *   — una o varias sucursales/clientes QBO agrupados bajo el mismo FTP/vendor.
 *   El límite de slots se calcula por cantidad de filas, no por cantidad de clientes
 *   (409 si ya se alcanzó plan.max_r365_connections + organization_addons.extra_r365_connections).
 *
 *   Body opcional: backfillFromDate (YYYY-MM-DD) → dispara backfillFromQboSinceDate
 *   en segundo plano. El backfill filtra por TxnDate, no por MetaData.LastUpdatedTime.
 *
 *   developerMode=true → relaja las validaciones de FTP para entornos de desarrollo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { backfillFromQboSinceDate, createSyncConfig, listSyncConfigs } from "@/modules/integrations/qbo-r365/service";
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

  const backfillFromDate: string | null =
    typeof body?.backfillFromDate === "string" && body.backfillFromDate.trim()
      ? body.backfillFromDate.trim()
      : null;

  if (backfillFromDate && !Number.isFinite(Date.parse(backfillFromDate))) {
    return NextResponse.json({ error: "Fecha de importación inválida" }, { status: 400 });
  }

  try {
    const existing = await listSyncConfigs(access.tenant.organizationId);

    // Compute effective slot limit = plan.max_r365_connections + addon.extra_r365_connections
    const { createSupabaseAdminClient } = await import("@/infrastructure/supabase/client/admin");
    const supabase = createSupabaseAdminClient();
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("integration_plan_id")
      .eq("id", access.tenant.organizationId)
      .maybeSingle();
    const integrationPlanId = (orgRow as Record<string, unknown> | null)?.integration_plan_id as string | null ?? null;
    let effectiveLimit: number | null = null;
    if (integrationPlanId) {
      const [planData, addonData] = await Promise.all([
        supabase.from("plans").select("max_r365_connections").eq("id", integrationPlanId).maybeSingle(),
        supabase.from("organization_addons").select("extra_r365_connections").eq("organization_id", access.tenant.organizationId).eq("status", "active").limit(1).maybeSingle(),
      ]);
      const base = (planData.data as Record<string, unknown> | null)?.max_r365_connections as number | null ?? null;
      const extra = ((addonData.data as Record<string, unknown> | null)?.extra_r365_connections as number) ?? 0;
      effectiveLimit = base != null ? base + extra : null;
    }
    if (effectiveLimit !== null && existing.length >= effectiveLimit) {
      return NextResponse.json(
        { error: `Límite de ${effectiveLimit} slot${effectiveLimit === 1 ? "" : "s"} alcanzado para tu plan.` },
        { status: 409 },
      );
    }

    const payload = {
      ...parsed.data,
      scheduleInterval: "daily" as const,
      lookbackHours: 0,
      template: "by_item" as const,
      taxMode: "none" as const,
      r365FtpSecure: true,
    };
    const id = await createSyncConfig(access.tenant.organizationId, access.userId, payload);

    if (backfillFromDate) {
      void backfillFromQboSinceDate(access.tenant.organizationId, id, backfillFromDate).catch((err: unknown) => {
        console.error("[qbo-backfill]", err instanceof Error ? err.message : err);
      });
    }

    return NextResponse.json({ id, backfilling: Boolean(backfillFromDate) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la sincronizacion" },
      { status: 400 },
    );
  }
}
