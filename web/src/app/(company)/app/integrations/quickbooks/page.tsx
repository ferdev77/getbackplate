import { QboR365Dashboard } from "@/modules/integrations/ui/qbo-r365-dashboard";
import { getCurrentUser } from "@/modules/memberships/queries";
import { requireTenantModule } from "@/shared/lib/access";
import { resolveActiveSuperadminImpersonationSession } from "@/shared/lib/impersonation";

export default async function IntegrationQuickbooksPage() {
  const tenant = await requireTenantModule("qbo_r365");
  const user = await getCurrentUser();
  const impersonationSession = user
    ? await resolveActiveSuperadminImpersonationSession(user.id)
    : null;
  const showDeveloperMode = impersonationSession?.organizationId === tenant.organizationId;

  return (
    <QboR365Dashboard
      organizationId={tenant.organizationId}
      deferredDataUrl="/api/company/integrations/qbo-r365/dashboard"
      showDeveloperMode={showDeveloperMode}
      className="mx-auto w-full max-w-[var(--gbp-content-max)] px-[var(--gbp-content-pad-x)] py-[var(--gbp-content-shell-pad-y)] sm:px-[var(--gbp-content-pad-x-sm)] sm:py-[var(--gbp-content-shell-pad-y-sm)]"
    />
  );
}
