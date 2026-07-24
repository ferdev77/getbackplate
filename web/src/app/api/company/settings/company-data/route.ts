import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const requestSchema = z.object({
  organizationName: z.string().trim().min(1).max(160).optional(),
  contactName: z.string().trim().max(160).optional(),
  supportPhone: z.string().trim().max(60).optional(),
  address: z.string().trim().max(300).optional(),
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
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const payload = parsed.data;
  const contactName = (payload.contactName ?? "").trim() || null;
  const supportPhone = (payload.supportPhone ?? "").trim() || null;
  const address = (payload.address ?? "").trim() || null;
  const feedbackWhatsapp = (payload.feedbackWhatsapp ?? "").trim() || null;
  const websiteUrl = normalizeWebsiteUrl((payload.websiteUrl ?? "").trim() || null);

  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();
  const [{ data: existingSettings }, identity, authUser] = await Promise.all([
    supabase
      .from("organization_settings")
      .select("support_email")
      .eq("organization_id", moduleAccess.tenant.organizationId)
      .maybeSingle(),
    admin
      .from("external_auth_identities")
      .select("email_at_link")
      .eq("provider", "intuit")
      .eq("user_id", moduleAccess.userId)
      .maybeSingle(),
    admin.auth.admin.getUserById(moduleAccess.userId),
  ]);
  const supportEmail = existingSettings?.support_email?.trim()
    || identity.data?.email_at_link?.trim()
    || authUser.data.user?.email?.trim()
    || null;

  if (payload.organizationName) {
    const { error: organizationError } = await admin
      .from("organizations")
      .update({ name: payload.organizationName })
      .eq("id", moduleAccess.tenant.organizationId);
    if (organizationError) {
      return NextResponse.json({ error: `Unable to save: ${organizationError.message}` }, { status: 400 });
    }
  }

  const { error } = await supabase.from("organization_settings").upsert(
    {
      organization_id: moduleAccess.tenant.organizationId,
      contact_name: contactName,
      support_email: supportEmail,
      support_phone: supportPhone,
      address,
      feedback_whatsapp: feedbackWhatsapp,
      website_url: websiteUrl,
      updated_by: moduleAccess.userId,
    },
    { onConflict: "organization_id" },
  );

  if (error) {
    await logAuditEvent({
      action: "settings.update",
      entityType: "organization_settings",
      entityId: moduleAccess.tenant.organizationId,
      organizationId: moduleAccess.tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: { error: error.message },
    });
    return NextResponse.json({ error: `Unable to save: ${error.message}` }, { status: 400 });
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
      organizationName: payload.organizationName,
      contactName,
      supportEmail,
      supportPhone,
      address,
      feedbackWhatsapp,
      websiteUrl,
    },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app/integrations/quickbooks");
  return NextResponse.json({ ok: true });
}
