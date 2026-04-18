import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const requestSchema = z.object({
  supportEmail: z.string().trim().max(150).optional(),
  supportPhone: z.string().trim().max(60).optional(),
  feedbackWhatsapp: z.string().trim().max(60).optional(),
  websiteUrl: z.string().trim().max(200).optional(),
});

function normalizeWebsiteUrl(value: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("settings");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const payload = parsed.data;
  const supportEmail = (payload.supportEmail ?? "").trim() || null;
  const supportPhone = (payload.supportPhone ?? "").trim() || null;
  const feedbackWhatsapp = (payload.feedbackWhatsapp ?? "").trim() || null;
  const websiteUrl = normalizeWebsiteUrl((payload.websiteUrl ?? "").trim() || null);

  if (supportEmail && !/^\S+@\S+\.\S+$/.test(supportEmail)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: moduleAccess.tenant.organizationId,
      support_email: supportEmail,
      support_phone: supportPhone,
      feedback_whatsapp: feedbackWhatsapp,
      website_url: websiteUrl,
      updated_by: moduleAccess.userId,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    const missingWebsiteColumn =
      error.message.includes("website_url") && error.message.toLowerCase().includes("column");

    await logAuditEvent({
      action: "settings.update",
      entityType: "organization_settings",
      entityId: moduleAccess.tenant.organizationId,
      organizationId: moduleAccess.tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: { error: error.message, missing_website_column: missingWebsiteColumn },
    });

    if (missingWebsiteColumn) {
      const { error: fallbackError } = await supabase.from("organization_settings").upsert(
        {
          organization_id: moduleAccess.tenant.organizationId,
          support_email: supportEmail,
          support_phone: supportPhone,
          feedback_whatsapp: feedbackWhatsapp,
          dashboard_note: websiteUrl,
          updated_by: moduleAccess.userId,
        },
        { onConflict: "organization_id" },
      );

      if (fallbackError) {
        return NextResponse.json(
          {
            error: `No se pudo guardar: ${fallbackError.message}`,
          },
          { status: 400 },
        );
      }

      return NextResponse.json({ ok: true, websiteStorageFallback: "dashboard_note" });
    }

    return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "settings.update",
    entityType: "organization_settings",
    entityId: moduleAccess.tenant.organizationId,
    organizationId: moduleAccess.tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "high",
    metadata: {
      supportEmail,
      supportPhone,
      feedbackWhatsapp,
      websiteUrl,
    },
  });

  return NextResponse.json({ ok: true });
}
