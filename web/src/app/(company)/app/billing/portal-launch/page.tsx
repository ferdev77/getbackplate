import {
  getEnabledModulesCached,
  getOrganizationByIdCached,
  getOrganizationSettingsCached,
} from "@/modules/organizations/cached-queries";
import { StripeLaunchBridge } from "@/modules/billing/ui/stripe-launch-bridge";
import { requireCompanyAccess } from "@/shared/lib/access";

export default async function BillingPortalLaunchPage() {
  const tenant = await requireCompanyAccess();

  const [organization, organizationSettings, enabledModules] = await Promise.all([
    getOrganizationByIdCached(tenant.organizationId),
    getOrganizationSettingsCached(tenant.organizationId),
    getEnabledModulesCached(tenant.organizationId),
  ]);

  const customBrandingEnabled = enabledModules.includes("custom_branding");
  const brandName = customBrandingEnabled ? (organization?.name?.trim() || "Empresa") : "GetBackplate";
  const logoUrl = customBrandingEnabled ? (organizationSettings?.company_logo_url ?? "") : "";

  return (
    <StripeLaunchBridge
      mode="portal"
      brandName={brandName}
      logoUrl={logoUrl}
      customBrandingEnabled={customBrandingEnabled}
    />
  );
}
