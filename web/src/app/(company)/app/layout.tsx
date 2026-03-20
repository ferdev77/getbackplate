import { getCurrentUser } from "@/modules/memberships/queries";
import { 
  getOrganizationById, 
  getOrganizationSettings, 
  getActivePlans, 
  getUserPreferences, 
  getEnabledModules,
  getActiveBranches,
} from "@/modules/organizations/queries";
import { requireCompanyAccess } from "@/shared/lib/access";
import { CompanyShell } from "@/shared/ui/company-shell";
import { FadeIn } from "@/shared/ui/animations";

export const dynamic = "force-dynamic";

export default async function CompanyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tenant = await requireCompanyAccess();

  const [user, organization] = await Promise.all([
    getCurrentUser(),
    getOrganizationById(tenant.organizationId),
  ]);

  const [orgSettings, preferences, activePlans, enabledModuleCodes, activeBranches] = await Promise.all([
    getOrganizationSettings(tenant.organizationId),
    user ? getUserPreferences(user.id, tenant.organizationId) : Promise.resolve(null),
    getActivePlans(),
    getEnabledModules(tenant.organizationId),
    getActiveBranches(tenant.organizationId),
  ]);

  const currentPlanById = organization?.plan_id
    ? activePlans.find((p) => p.id === organization.plan_id) ?? null
    : null;

  const inferredCurrentPlan = currentPlanById ?? activePlans.find((plan) => plan.code === "starter") ?? null;

  const enabledModules = [
    "company_portal",
    "dashboard",
    "settings",
    ...(enabledModuleCodes.has("employees") ? ["employees"] : []),
    ...(enabledModuleCodes.has("documents") ? ["documents"] : []),
    ...(enabledModuleCodes.has("announcements") ? ["announcements"] : []),
    ...(enabledModuleCodes.has("checklists") ? ["checklists"] : []),
    ...(enabledModuleCodes.has("reports") ? ["reports"] : []),
  ];

  const roleLabelByCode: Record<string, string> = {
    company_admin: "Admin de empresa",
    manager: "Manager",
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
      sessionRoleLabel={roleLabelByCode[tenant.roleCode] ?? tenant.roleCode}
      sessionAvatarUrl={avatarUrl}
      tenantId={tenant.organizationId}
      settingsSnapshot={{
        billingPlan: inferredCurrentPlan?.name ?? orgSettings?.billing_plan ?? "Sin plan",
        billingPeriod: inferredCurrentPlan?.billing_period ?? orgSettings?.billing_period ?? "monthly",
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
      enabledModules={enabledModules}
      branchOptions={activeBranches}
    >
      <FadeIn>
        {children}
      </FadeIn>
    </CompanyShell>
  );
}
