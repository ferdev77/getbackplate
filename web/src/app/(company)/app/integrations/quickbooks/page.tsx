import { QboR365Dashboard } from "@/modules/integrations/ui/qbo-r365-dashboard";
import { requireTenantModule } from "@/shared/lib/access";

export default async function IntegrationQuickbooksPage() {
  const tenant = await requireTenantModule("qbo_r365");

  return (
    <QboR365Dashboard
      organizationId={tenant.organizationId}
      deferredDataUrl="/api/company/integrations/qbo-r365/dashboard"
      className="mx-auto w-full max-w-[var(--gbp-content-max)] px-[var(--gbp-content-pad-x)] py-[var(--gbp-content-shell-pad-y)] sm:px-[var(--gbp-content-pad-x-sm)] sm:py-[var(--gbp-content-shell-pad-y-sm)]"
    />
  );
}
