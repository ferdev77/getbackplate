import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { assertCompanyAdminModuleApi, isModuleEnabledForOrganization } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

const vendorProfileSchema = z.object({
  company: z.string().trim().max(160),
  contactName: z.string().trim().max(160),
  email: z.string().trim().email().max(160).or(z.literal("")),
  phone: z.string().trim().max(80),
  address: z.string().trim().max(300),
  website: z.string().trim().max(200),
});

export async function PUT(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!(await isModuleEnabledForOrganization(access.tenant.organizationId, "qbo_r365"))) {
    return NextResponse.json({ error: "The QuickBooks integration is not active." }, { status: 403 });
  }

  const parsed = vendorProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid vendor details." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("organizations").update({ integration_vendor_profile: parsed.data }).eq("id", access.tenant.organizationId);
  if (error) return NextResponse.json({ error: "Could not save the vendor profile." }, { status: 500 });

  await logAuditEvent({
    action: "settings.integration_vendor_profile.update",
    entityType: "organization",
    entityId: access.tenant.organizationId,
    organizationId: access.tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "low",
  });
  revalidatePath("/app/settings");
  return NextResponse.json({ ok: true });
}
