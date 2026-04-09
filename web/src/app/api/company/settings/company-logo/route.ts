import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  ensureOrganizationLogoBucketExists,
  uploadOrganizationLogo,
  validateOrganizationLogoFile,
} from "@/shared/lib/organization-logo";

type OrganizationSettingsUpsertPayload = {
  organization_id: string;
  updated_by: string;
  company_logo_url?: string;
  company_logo_path?: string;
  company_logo_dark_url?: string;
  company_logo_dark_path?: string;
  company_favicon_url?: string;
  company_favicon_path?: string;
};

export async function POST(request: Request) {
  const moduleAccess = await assertCompanyManagerModuleApi("custom_branding");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const formData = await request.formData();
  const file = formData.get("logo");
  const rawVariant = formData.get("variant");
  const variant = rawVariant === "dark" ? "dark" : rawVariant === "favicon" ? "favicon" : "light";
  const validation = validateOrganizationLogoFile(file instanceof File ? file : null);

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: existingSettings } = await supabase
    .from("organization_settings")
    .select("company_logo_path, company_logo_dark_path, company_favicon_path")
    .eq("organization_id", moduleAccess.tenant.organizationId)
    .maybeSingle();

  await ensureOrganizationLogoBucketExists();

  const previousLogoPath =
    variant === "dark"
      ? (existingSettings?.company_logo_dark_path ?? null)
      : variant === "favicon"
      ? (existingSettings?.company_favicon_path ?? null)
      : (existingSettings?.company_logo_path ?? null);

  const uploadResult = await uploadOrganizationLogo({
    organizationId: moduleAccess.tenant.organizationId,
    file: file as File,
    variant,
    previousLogoPath,
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

  const updatePayload: OrganizationSettingsUpsertPayload = {
    organization_id: moduleAccess.tenant.organizationId,
    updated_by: moduleAccess.userId,
  };

  if (variant === "dark") {
    updatePayload.company_logo_dark_url = uploadResult.logoUrl;
    updatePayload.company_logo_dark_path = uploadResult.logoPath;
  } else if (variant === "favicon") {
    updatePayload.company_favicon_url = uploadResult.logoUrl;
    updatePayload.company_favicon_path = uploadResult.logoPath;
  } else {
    updatePayload.company_logo_url = uploadResult.logoUrl;
    updatePayload.company_logo_path = uploadResult.logoPath;
  }

  const { error: updateError } = await supabase.from("organization_settings").upsert(
    updatePayload,
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
      variant,
    },
  });

  revalidateTag("org-settings-v1", "max");

  return NextResponse.json({ ok: true, logoUrl: uploadResult.logoUrl, variant });
}
