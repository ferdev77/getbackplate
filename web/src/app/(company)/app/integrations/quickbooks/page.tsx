import { QboR365Dashboard } from "@/modules/integrations/ui/qbo-r365-dashboard";
import { getCurrentUser } from "@/modules/memberships/queries";
import { requireTenantModule } from "@/shared/lib/access";
import { resolveActiveSuperadminImpersonationSession } from "@/shared/lib/impersonation";
import { getOrganizationByIdCached, getOrganizationSettingsCached } from "@/modules/organizations/cached-queries";

export default async function IntegrationQuickbooksPage() {
  const tenant = await requireTenantModule("qbo_r365");
  const user = await getCurrentUser();
  const [impersonationSession, org, orgSettings] = await Promise.all([
    user ? resolveActiveSuperadminImpersonationSession(user.id) : Promise.resolve(null),
    getOrganizationByIdCached(tenant.organizationId),
    getOrganizationSettingsCached(tenant.organizationId),
  ]);
  const showDeveloperMode = impersonationSession?.organizationId === tenant.organizationId;

  return (
    <QboR365Dashboard
      organizationId={tenant.organizationId}
      deferredDataUrl="/api/company/integrations/qbo-r365/dashboard"
      showDeveloperMode={showDeveloperMode}
      orgName={org?.name ?? undefined}
      orgLogoUrl={orgSettings?.company_logo_url ?? undefined}
      className="mx-auto w-full max-w-[var(--gbp-content-max)] px-[var(--gbp-content-pad-x)] py-[var(--gbp-content-shell-pad-y)] sm:px-[var(--gbp-content-pad-x-sm)] sm:py-[var(--gbp-content-shell-pad-y-sm)]"
    />
  );
}
