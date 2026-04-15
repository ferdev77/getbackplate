import type { Metadata } from "next";
import { getCurrentUser } from "@/modules/memberships/queries";
import {
  getActivePlansCached,
  getPlanModulesMapCached,
  getOrganizationSettingsCached,
  getEnabledModulesCached,
  getActiveBranchesCached,
  getLatestSubscriptionCached,
  getOrganizationBillingGateCached,
  getUserPreferencesCached,
  getOrganizationByIdCached,
} from "@/modules/organizations/cached-queries";
import { requireCompanyAccess } from "@/shared/lib/access";
import { resolveActiveSuperadminImpersonationSession } from "@/shared/lib/impersonation";
import { CompanyShell } from "@/shared/ui/company-shell";
import { FadeIn } from "@/shared/ui/animations";

export async function generateMetadata(): Promise<Metadata> {
  let tenant;
  try {
    tenant = await requireCompanyAccess();
  } catch {
    return {};
  }

  const [organization, orgSettings, enabledModules] = await Promise.all([
    getOrganizationByIdCached(tenant.organizationId),
    getOrganizationSettingsCached(tenant.organizationId),
    getEnabledModulesCached(tenant.organizationId),
  ]);

  const customBranding = enabledModules.includes("custom_branding");

  if (customBranding && (organization?.name || orgSettings?.company_favicon_url)) {
    return {
      title: {
        template: `%s | ${organization?.name ?? "Portal"}`,
        default: organization?.name ?? "Portal",
      },
      icons: orgSettings?.company_favicon_url
        ? {
            icon: [
              { url: orgSettings.company_favicon_url },
            ],
          }
        : undefined,
    };
  }

  return {};
}

export default async function CompanyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // ── Auth gate (requires cookies — always dynamic) ─────────────────
  const tenant = await requireCompanyAccess();

  // ── Parallel: user + org (org uses cross-request cache) ───────────
  const [user, organization] = await Promise.all([
    getCurrentUser(),
    getOrganizationByIdCached(tenant.organizationId),
  ]);

  // ── Impersonation (depends on user) ───────────────────────────────
  const impersonationSession = user
    ? await resolveActiveSuperadminImpersonationSession(user.id)
    : null;

  // ── All secondary data — cross-request cached ─────────────────────
  // These queries use unstable_cache with TTL (30s-300s) + admin client.
  // They do NOT create a new Supabase server client per call,
  // reducing cookie parsing + auth overhead to zero.
  const [
    orgSettings,
    preferences,
    activePlans,
    planModulesByPlanId,
    enabledModuleCodes,
    activeBranches,
    latestSubscription,
    billingGate,
  ] = await Promise.all([
    getOrganizationSettingsCached(tenant.organizationId),
    user ? getUserPreferencesCached(user.id, tenant.organizationId) : Promise.resolve(null),
    getActivePlansCached(),
    getPlanModulesMapCached(),
    getEnabledModulesCached(tenant.organizationId),
    getActiveBranchesCached(tenant.organizationId),
    getLatestSubscriptionCached(tenant.organizationId),
    getOrganizationBillingGateCached(tenant.organizationId),
  ]);

  // ── enabledModuleCodes comes as string[] from cache (Set not serializable) ──
  const enabledModuleCodesSet = new Set(enabledModuleCodes);

  const subscriptionEndsAt =
    typeof latestSubscription?.current_period_end === "string"
      ? latestSubscription.current_period_end
      : null;
  const subscriptionEndDate = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
  const now = new Date();
  const isTrialActive =
    latestSubscription?.status === "trialing" &&
    Boolean(subscriptionEndDate && !Number.isNaN(subscriptionEndDate.getTime()) && subscriptionEndDate >= now);

  const trialDaysRemaining = isTrialActive && subscriptionEndDate
    ? Math.max(0, Math.ceil((subscriptionEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const currentPlanById = organization?.plan_id
    ? activePlans.find((p) => p.id === organization.plan_id) ?? null
    : null;

  const inferredCurrentPlan = currentPlanById ?? null;

  const enabledModules = [
    "company_portal",
    "dashboard",
    "settings",
    ...(enabledModuleCodesSet.has("employees") ? ["employees"] : []),
    ...(enabledModuleCodesSet.has("documents") ? ["documents"] : []),
    ...(enabledModuleCodesSet.has("announcements") ? ["announcements"] : []),
    ...(enabledModuleCodesSet.has("checklists") ? ["checklists"] : []),
    ...(enabledModuleCodesSet.has("reports") ? ["reports"] : []),
    ...(enabledModuleCodesSet.has("ai_assistant") ? ["ai_assistant"] : []),
    ...(enabledModuleCodesSet.has("vendors") ? ["vendors"] : []),
  ];

  const roleLabelByCode: Record<string, string> = {
    company_admin: "Admin de empresa",
    
    employee: "Empleado",
  };

  const profileName =
    typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
      ? user.user_metadata.full_name.trim()
      : typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
        ? user.user_metadata.name.trim()
        : user?.email ?? "Usuario";
  const avatarUrl =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : "";

  return (
    <CompanyShell
      organizationLabel={organization?.name ?? ""}
      sessionUserName={profileName}
      sessionUserEmail={user?.email ?? ""}
      sessionRoleLabel={
        impersonationSession
          ? "Superadmin (impersonando)"
          : (roleLabelByCode[tenant.roleCode] ?? tenant.roleCode)
      }
      sessionAvatarUrl={avatarUrl}
      tenantId={tenant.organizationId}
      settingsSnapshot={{
        billingPlan: inferredCurrentPlan?.name ?? orgSettings?.billing_plan ?? "Sin plan",
        billingPeriod: orgSettings?.billing_period ?? inferredCurrentPlan?.billing_period ?? "monthly",
        billedTo: orgSettings?.billed_to ?? organization?.name ?? "",
        billingEmail: orgSettings?.billing_email ?? user?.email ?? "",
        paymentLast4: orgSettings?.payment_last4 ?? "4242",
        invoiceEmailsEnabled: orgSettings?.invoice_emails_enabled ?? true,
        theme: preferences?.theme ?? "default",
        language: preferences?.language ?? "es",
        dateFormat: preferences?.date_format ?? "DD/MM/YYYY",
        timezoneMode: preferences?.timezone_mode ?? "auto",
        timezoneManual: preferences?.timezone_manual ?? "America/Chicago (CST)",
        analyticsEnabled: preferences?.analytics_enabled ?? true,
        twoFactorEnabled: preferences?.two_factor_enabled ?? false,
        twoFactorMethod: preferences?.two_factor_method ?? "app",
      }}
      availablePlans={activePlans.map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceAmount: plan.price_amount,
        billingPeriod: plan.billing_period,
        maxBranches: plan.max_branches,
        maxUsers: plan.max_users,
        maxEmployees: plan.max_employees,
        maxStorageMb: plan.max_storage_mb,
        stripePriceId: plan.stripe_price_id ?? null,
      }))}
      currentPlanCode={inferredCurrentPlan?.code ?? null}
      currentPlanName={inferredCurrentPlan?.name ?? "Sin plan"}
      companyLogoUrl={orgSettings?.company_logo_url ?? ""}
      companyLogoDarkUrl={orgSettings?.company_logo_dark_url ?? ""}
      customBrandingEnabled={enabledModuleCodesSet.has("custom_branding")}
      planModulesByPlanId={planModulesByPlanId}
      enabledModules={enabledModules}
      branchOptions={activeBranches}
      impersonationMode={Boolean(impersonationSession)}
      billingGate={billingGate}
      trialStatus={{
        isActive: isTrialActive,
        daysRemaining: trialDaysRemaining,
        endsAt: subscriptionEndsAt,
      }}
    >
      <FadeIn>
        {children}
      </FadeIn>
    </CompanyShell>
  );
}
