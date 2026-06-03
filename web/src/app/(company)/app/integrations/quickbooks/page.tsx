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
  let planName = "QBO";

  {
    const supabase = createSupabaseAdminClient();
    const { data: orgRow } = await supabase
      .from("organizations")
      .select("integration_plan_id, integration_vendor_profile, integration_onboarding_completed_at")
      .eq("id", tenant.organizationId)
      .maybeSingle();

    const integrationPlanId = (orgRow as Record<string, unknown> | null)?.integration_plan_id as string | null ?? null;
    vendorProfile = (orgRow as Record<string, unknown> | null)?.integration_vendor_profile as Record<string, string> | null ?? null;
    const onboardingCompletedAt = (orgRow as Record<string, unknown> | null)?.integration_onboarding_completed_at as string | null ?? null;

    // Show onboarding if: has a plan AND never completed onboarding
    showOnboarding = integrationPlanId != null && onboardingCompletedAt == null;

    if (integrationPlanId) {
      const { data: plan } = await supabase
        .from("plans")
        .select("max_r365_connections, name")
        .eq("id", integrationPlanId)
        .maybeSingle();
      maxR365Connections = (plan as Record<string, unknown> | null)?.max_r365_connections as number | null ?? null;
      planName = (plan as Record<string, unknown> | null)?.name as string ?? "QBO";
    }
  }

  const showDeveloperMode = impersonationSession?.organizationId === tenant.organizationId;

  return (
    <QboR365Dashboard
      organizationId={tenant.organizationId}
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
