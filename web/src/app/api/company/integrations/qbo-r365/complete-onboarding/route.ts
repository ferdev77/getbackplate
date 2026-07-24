import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

type VendorProfile = {
  company?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  website?: string;
};

export async function POST(req: NextRequest) {
  const access = await assertCompanyAdminModuleApi("qbo_r365");
  if (!access.ok) {
    return NextResponse.json({ error: "Access denied." }, { status: access.status });
  }

  const { organizationId } = access.tenant;
  const { userId } = access;
  const body = (await req.json()) as { vendorProfile?: VendorProfile; complete?: boolean; skip?: boolean };

  if (body.complete && body.skip) {
    return NextResponse.json({ error: "Setup cannot be completed and skipped at the same time." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const updates: {
    integration_onboarding_completed_at?: string | null;
    integration_onboarding_skipped_at?: string | null;
  } = {};
  if (body.vendorProfile !== undefined) {
    const profile = {
      company: typeof body.vendorProfile.company === "string" ? body.vendorProfile.company.trim() : "",
      contactName: typeof body.vendorProfile.contactName === "string" ? body.vendorProfile.contactName.trim() : "",
      phone: typeof body.vendorProfile.phone === "string" ? body.vendorProfile.phone.trim() : "",
      address: typeof body.vendorProfile.address === "string" ? body.vendorProfile.address.trim() : "",
      website: typeof body.vendorProfile.website === "string" ? body.vendorProfile.website.trim() : "",
    };
    const [existingSettings, identity, authUser] = await Promise.all([
      supabase
        .from("organization_settings")
        .select("support_email")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("external_auth_identities")
        .select("email_at_link")
        .eq("provider", "intuit")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase.auth.admin.getUserById(userId),
    ]);
    const verifiedEmail = existingSettings.data?.support_email?.trim()
      || identity.data?.email_at_link?.trim()
      || authUser.data.user?.email?.trim()
      || "";
    const [{ error: settingsError }, { error: organizationError }] = await Promise.all([
      supabase.from("organization_settings").upsert(
        {
          organization_id: organizationId,
          contact_name: profile.contactName || null,
          support_email: verifiedEmail || null,
          support_phone: profile.phone || null,
          address: profile.address || null,
          website_url: profile.website || null,
          updated_by: userId,
        },
        { onConflict: "organization_id" },
      ),
      profile.company
        ? supabase.from("organizations").update({ name: profile.company }).eq("id", organizationId)
        : Promise.resolve({ error: null }),
    ]);
    if (settingsError || organizationError) {
      return NextResponse.json({ error: "Unable to save company data. Please try again." }, { status: 500 });
    }
  }
  if (body.skip) {
    updates.integration_onboarding_completed_at = null;
    updates.integration_onboarding_skipped_at = new Date().toISOString();
  }

  if (body.complete) {
    const [organization, companySettings, qboConnection, syncConfigs] = await Promise.all([
      supabase
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .single(),
      supabase
        .from("organization_settings")
        .select("contact_name, support_email")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("integration_connections")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("provider", "quickbooks_online")
        .eq("status", "connected")
        .limit(1),
      supabase
        .from("qbo_r365_sync_configs")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .limit(1),
    ]);
    const hasVendorProfile = Boolean(
      organization.data?.name?.trim()
      && companySettings.data?.contact_name?.trim()
      && companySettings.data?.support_email?.trim(),
    );
    const missing = [
      !qboConnection.data?.length ? "quickbooks" : null,
      !hasVendorProfile ? "vendor_profile" : null,
      !syncConfigs.data?.length ? "r365_connection" : null,
    ].filter(Boolean);

    if (organization.error || companySettings.error || qboConnection.error || syncConfigs.error) {
      return NextResponse.json({ error: "Unable to validate setup completion." }, { status: 500 });
    }
    if (missing.length > 0) {
      return NextResponse.json({ error: "Setup is not complete.", missing }, { status: 409 });
    }

    updates.integration_onboarding_completed_at = new Date().toISOString();
    updates.integration_onboarding_skipped_at = null;
  }

  const { error } = Object.keys(updates).length > 0
    ? await supabase
        .from("organizations")
        .update(updates)
        .eq("id", organizationId)
    : { error: null };

  if (error) {
    return NextResponse.json({ error: "Unable to complete setup. Please try again." }, { status: 500 });
  }

  revalidatePath("/app/settings");
  revalidatePath("/app/integrations/quickbooks");
  return NextResponse.json({ ok: true });
}
