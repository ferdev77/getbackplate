import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getCurrentUser } from "@/modules/memberships/queries";
import { requireCompanyAccess } from "@/shared/lib/access";
import { CompanyShell } from "@/shared/ui/company-shell";

export const dynamic = "force-dynamic";

export default async function CompanyLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const tenant = await requireCompanyAccess();
  const supabase = await createSupabaseServerClient();

  const [user, { data: organization }] = await Promise.all([
    getCurrentUser(),
    supabase
      .from("organizations")
      .select("name, plan_id")
      .eq("id", tenant.organizationId)
      .maybeSingle(),
  ]);

  const [{ data: orgSettings }, { data: preferences }, { data: plans }] = await Promise.all([
    supabase
      .from("organization_settings")
      .select(
        "billing_plan, billing_period, billed_to, billing_email, payment_last4, invoice_emails_enabled",
      )
      .eq("organization_id", tenant.organizationId)
      .maybeSingle(),
    user
      ? supabase
          .from("user_preferences")
          .select(
            "theme, language, date_format, timezone_mode, timezone_manual, analytics_enabled, two_factor_enabled, two_factor_method",
          )
          .eq("user_id", user.id)
          .eq("organization_id", tenant.organizationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("plans")
      .select("id, code, name, price_amount, billing_period, is_active, max_branches, max_users, max_employees, max_storage_mb")
      .eq("is_active", true)
      .order("price_amount", { ascending: true, nullsFirst: false }),
  ]);

  // Derive current plan from the already-fetched list — no extra round-trip needed
  const currentPlanById = organization?.plan_id
    ? (plans ?? []).find((p) => p.id === organization.plan_id) ?? null
    : null;

  const activePlans = plans ?? [];
  const inferredCurrentPlan = currentPlanById ?? activePlans.find((plan) => plan.code === "starter") ?? null;

  const [employeesEnabled, documentsEnabled, announcementsEnabled, checklistsEnabled, reportsEnabled] =
    await Promise.all([
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "employees",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "documents",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "announcements",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "checklists",
      }),
      supabase.rpc("is_module_enabled", {
        org_id: tenant.organizationId,
        module_code: "reports",
      }),
    ]);

  const enabledModules = [
    "company_portal",
    "dashboard",
    "settings",
    ...(employeesEnabled.data ? ["employees"] : []),
    ...(documentsEnabled.data ? ["documents"] : []),
    ...(announcementsEnabled.data ? ["announcements"] : []),
    ...(checklistsEnabled.data ? ["checklists"] : []),
    ...(reportsEnabled.data ? ["reports"] : []),
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
      availablePlans={(plans ?? []).map((plan) => ({
        id: plan.id,
        code: plan.code,
        name: plan.name,
        priceAmount: plan.price_amount,
        billingPeriod: plan.billing_period,
        maxBranches: plan.max_branches,
        maxUsers: plan.max_users,
        maxEmployees: plan.max_employees,
        maxStorageMb: plan.max_storage_mb,
      }))}
      currentPlanCode={inferredCurrentPlan?.code ?? null}
      currentPlanName={inferredCurrentPlan?.name ?? "Sin plan"}
      enabledModules={enabledModules}
    >
      {children}
    </CompanyShell>
  );
}
