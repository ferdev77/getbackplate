import { QboR365Dashboard } from "@/modules/integrations/ui/qbo-r365-dashboard";
import { getCurrentUser } from "@/modules/memberships/queries";
import { requireTenantModule } from "@/shared/lib/access";
import { resolveActiveSuperadminImpersonationSession } from "@/shared/lib/impersonation";
import { getOrganizationByIdCached, getOrganizationSettingsCached } from "@/modules/organizations/cached-queries";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export default async function IntegrationQuickbooksPage() {
  const tenant = await requireTenantModule("qbo_r365");
  const user = await getCurrentUser();

  const [impersonationSession, org, orgSettings] = await Promise.all([
    user ? resolveActiveSuperadminImpersonationSession(user.id) : Promise.resolve(null),
    getOrganizationByIdCached(tenant.organizationId),
    getOrganizationSettingsCached(tenant.organizationId),
  ]);

  // Fetch integration plan info + onboarding state
  let maxR365Connections: number | null = null;
  let showOnboarding = false;
  let vendorProfile: Record<string, string> | null = null;
  let planName = "QuickBooks® Online";

  {
    const supabase = createSupabaseAdminClient();
    const [organizationResult, companySettingsResult, identityResult] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, integration_plan_id, integration_onboarding_completed_at, integration_onboarding_skipped_at")
        .eq("id", tenant.organizationId)
        .maybeSingle(),
      supabase
        .from("organization_settings")
        .select("contact_name, support_email, support_phone, address, website_url")
        .eq("organization_id", tenant.organizationId)
        .maybeSingle(),
      user
        ? supabase
            .from("external_auth_identities")
            .select("email_at_link, profile")
            .eq("provider", "intuit")
            .eq("user_id", user.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const orgRow = organizationResult.data;
    const companySettings = companySettingsResult.data;

    const integrationPlanId = (orgRow as Record<string, unknown> | null)?.integration_plan_id as string | null ?? null;
    const identity = identityResult.data as { email_at_link?: string | null; profile?: Record<string, unknown> | null } | null;
    const identityProfile = identity?.profile ?? {};
    const identityAddress = identityProfile.address && typeof identityProfile.address === "object"
      ? identityProfile.address as Record<string, unknown>
      : {};
    const formattedAddress = [
      identityAddress.streetAddress,
      identityAddress.locality,
      identityAddress.region,
      identityAddress.postalCode,
      identityAddress.country,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0).join(", ");
    const identityName = [identityProfile.givenName, identityProfile.familyName]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ");
    const verifiedEmail = identity?.email_at_link ?? user?.email ?? "";
    vendorProfile = {
      company: orgRow?.name || "",
      contactName: companySettings?.contact_name || String(user?.user_metadata?.full_name ?? "") || identityName,
      email: companySettings?.support_email || verifiedEmail,
      phone: companySettings?.support_phone
        || (identityProfile.phoneNumberVerified === true && typeof identityProfile.phoneNumber === "string" ? identityProfile.phoneNumber : ""),
      address: companySettings?.address || formattedAddress,
      website: companySettings?.website_url || "",
    };
    const onboardingCompletedAt = (orgRow as Record<string, unknown> | null)?.integration_onboarding_completed_at as string | null ?? null;
    const onboardingSkippedAt = (orgRow as Record<string, unknown> | null)?.integration_onboarding_skipped_at as string | null ?? null;

    // A dismissed onboarding stays available from the dashboard without reopening on every visit.
    showOnboarding = integrationPlanId != null && onboardingCompletedAt == null && onboardingSkippedAt == null;

    if (integrationPlanId) {
      const [planData, addonData] = await Promise.all([
        supabase.from("plans").select("max_r365_connections, name").eq("id", integrationPlanId).maybeSingle(),
        supabase.from("organization_addons").select("extra_r365_connections").eq("organization_id", tenant.organizationId).eq("status", "active").limit(1).maybeSingle(),
      ]);
      const base = (planData.data as Record<string, unknown> | null)?.max_r365_connections as number | null ?? null;
      const extra = ((addonData.data as Record<string, unknown> | null)?.extra_r365_connections as number) ?? 0;
      maxR365Connections = base != null ? base + extra : null;
      planName = (planData.data as Record<string, unknown> | null)?.name as string ?? "QuickBooks® Online";
    }
  }

  const showDeveloperMode = impersonationSession?.organizationId === tenant.organizationId;

  return (
    <QboR365Dashboard
      organizationId={tenant.organizationId}
      locale="en"
      deferredDataUrl="/api/company/integrations/qbo-r365/dashboard"
      showDeveloperMode={showDeveloperMode}
      orgName={org?.name ?? undefined}
      orgLogoUrl={orgSettings?.company_logo_url ?? undefined}
      maxR365Connections={maxR365Connections}
      showOnboarding={showOnboarding}
      vendorProfile={vendorProfile}
      planName={planName}
      className="mx-auto w-full max-w-[var(--gbp-content-max)] px-[var(--gbp-content-pad-x)] py-[var(--gbp-content-shell-pad-y)] sm:px-[var(--gbp-content-pad-x-sm)] sm:py-[var(--gbp-content-shell-pad-y-sm)]"
    />
  );
}
