import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  ensureOrganizationLogoBucketExists,
  uploadOrganizationLogo,
  validateOrganizationLogoFile,
} from "@/shared/lib/organization-logo";

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("custom_branding");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const formData = await request.formData();
  const file = formData.get("logo");
  const validation = validateOrganizationLogoFile(file instanceof File ? file : null);

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingSettings } = await supabase
    .from("organization_settings")
    .select("company_logo_path")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .maybeSingle();

  await ensureOrganizationLogoBucketExists();

  const uploadResult = await uploadOrganizationLogo({
    organizationId: moduleAccess.tenant.organizationId,
    file: file as File,
    previousLogoPath: existingSettings?.company_logo_path ?? null,
  });

  if (!uploadResult.ok) {
    await logAuditEvent({
      action: "settings.branding.logo.update",
      entityType: "organization_settings",
      organizationId: moduleAccess.tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "medium",
      metadata: {
        actor_user_id: moduleAccess.userId,
        error: uploadResult.error,
      },
    });
    return NextResponse.json({ error: uploadResult.error }, { status: 400 });
  }

  const { error: updateError } = await supabase.from("organization_settings").upsert(
    {
      organization_id: moduleAccess.tenant.organizationId,
      company_logo_url: uploadResult.logoUrl,
      company_logo_path: uploadResult.logoPath,
      updated_by: moduleAccess.userId,
    },
    { onConflict: "organization_id" },
  );

  if (updateError) {
    await logAuditEvent({
      action: "settings.branding.logo.update",
      entityType: "organization_settings",
      organizationId: moduleAccess.tenant.organizationId,
      eventDomain: "settings",
      outcome: "error",
      severity: "high",
      metadata: {
        actor_user_id: moduleAccess.userId,
        error: updateError.message,
      },
    });
    return NextResponse.json({ error: `No se pudo guardar logo: ${updateError.message}` }, { status: 400 });
  }

  await logAuditEvent({
    action: "settings.branding.logo.update",
    entityType: "organization_settings",
    organizationId: moduleAccess.tenant.organizationId,
    eventDomain: "settings",
    outcome: "success",
    severity: "medium",
    metadata: {
      actor_user_id: moduleAccess.userId,
      logo_path: uploadResult.logoPath,
    },
  });

  return NextResponse.json({ ok: true, logoUrl: uploadResult.logoUrl });
}
