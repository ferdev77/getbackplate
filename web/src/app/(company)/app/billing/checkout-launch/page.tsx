import { redirect } from "next/navigation";

import {
  getEnabledModulesCached,
  getOrganizationByIdCached,
  getOrganizationSettingsCached,
} from "@/modules/organizations/cached-queries";
import { StripeLaunchBridge } from "@/modules/billing/ui/stripe-launch-bridge";
import { requireCompanyAccess } from "@/shared/lib/access";

type CheckoutLaunchPageProps = {
  searchParams: Promise<{
    planId?: string;
    billingPeriod?: string;
  }>;
};

export default async function CheckoutLaunchPage({ searchParams }: CheckoutLaunchPageProps) {
  const tenant = await requireCompanyAccess();
  const params = await searchParams;

  const planId = String(params.planId ?? "").trim();
  const billingPeriod = String(params.billingPeriod ?? "").trim().toLowerCase() === "yearly" ? "yearly" : "monthly";

  if (!planId) {
    redirect("/app/dashboard?status=error&message=Selecciona%20un%20plan%20antes%20de%20continuar");
  }

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
      mode="checkout"
      brandName={brandName}
      logoUrl={logoUrl}
      customBrandingEnabled={customBrandingEnabled}
      planId={planId}
      billingPeriod={billingPeriod}
    />
  );
}
