import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getEnabledModules } from "@/modules/organizations/queries";
import { requireTenantModule } from "@/shared/lib/access";
import { CompanyDashboardWorkspace } from "@/shared/ui/company-dashboard-workspace";
import { PaymentSuccessBanner } from "@/shared/ui/payment-success-banner";

type CompanyDashboardPageProps = {
  searchParams: Promise<Record<string, string | undefined>>;
};

export default async function CompanyDashboardPage({ searchParams }: CompanyDashboardPageProps) {
  const tenant = await requireTenantModule("dashboard");
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const selectedBranch = typeof params?.branch === "string" ? params.branch.trim() : "";

  const enabledModuleCodes = await getEnabledModules(tenant.organizationId);
  const isReportsEnabled = enabledModuleCodes.has("reports");
  const isEmployeesEnabled = enabledModuleCodes.has("employees");
  const [{ data: organization }, { data: branches }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status")
      .eq("id", tenant.organizationId)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const customBrandingEnabled = enabledModuleCodes.has("custom_branding");

  const mappedBranches = (branches ?? []).map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));
  const selectedBranchName = mappedBranches.find((branch) => branch.id === selectedBranch)?.name ?? null;

  const branchNameMap = new Map(mappedBranches.map((item) => [item.id, item.name]));

  const moduleStatus = [
    { code: "documents", label: "Documentos", enabled: enabledModuleCodes.has("documents") },
    { code: "announcements", label: "Avisos", enabled: enabledModuleCodes.has("announcements") },
    { code: "checklists", label: "Checklists", enabled: enabledModuleCodes.has("checklists") },
    { code: "reports", label: "Reportes", enabled: isReportsEnabled },
    { code: "employees", label: "Usuarios / Empleados", enabled: isEmployeesEnabled },
  ];

  const showPaymentSuccess = params?.success === "true";

  return (
    <>
      <PaymentSuccessBanner showOnLoad={showPaymentSuccess} />
      
      <CompanyDashboardWorkspace
        organizationName={organization?.name ?? "Panel de empresa"}
        organizationSlug={organization?.slug ?? "-"}
        organizationStatus={organization?.status ?? "active"}
        employeesCount={0}
        employeesOnlyCount={0}
        usersOnlyCount={0}
        branchesCount={selectedBranch ? 1 : mappedBranches.length}
        checklistTodayCount={0}
        checklistWeekCount={0}
        pendingReviewCount={0}
        openFlagsCount={0}
        announcements={[]}
        recentDocuments={[]}
        branchNameMap={branchNameMap}
        moduleStatus={moduleStatus}
        selectedLocationName={selectedBranchName}
        deferredDataUrl={`/api/company/dashboard${selectedBranch ? `?branch=${selectedBranch}` : ""}`}
      />
    </>
  );
}
