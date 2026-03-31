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
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const enabledModuleCodes = await getEnabledModules(tenant.organizationId);
  const isDocumentsEnabled = enabledModuleCodes.has("documents");
  const isAnnouncementsEnabled = enabledModuleCodes.has("announcements");
  const isChecklistsEnabled = enabledModuleCodes.has("checklists");
  const isReportsEnabled = enabledModuleCodes.has("reports");
  const isEmployeesEnabled = enabledModuleCodes.has("employees");

  const employeesCountQuery = supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId);

  const todayChecklistQuery = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId)
    .gte("created_at", todayStart.toISOString());

  const weekChecklistQuery = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId)
    .gte("created_at", weekStart.toISOString());

  const pendingReviewQuery = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId)
    .eq("status", "submitted");

  const [
    { count: employeesCount },
    { count: usersCount },
    { count: branchesCount },
    { data: organization },
    { data: branches },
    { data: announcements },
    { count: todayChecklistCount },
    { count: weekChecklistCount },
    { count: pendingReviewCount },
    { count: openFlagsCount },
    { data: recentDocuments },
  ] = await Promise.all([
      employeesCountQuery,
      supabase
        .from("organization_user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", tenant.organizationId)
        .eq("is_employee", false),
      supabase
        .from("branches")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", tenant.organizationId),
      supabase
        .from("organizations")
        .select("id, name, slug, status")
        .eq("id", tenant.organizationId)
        .maybeSingle(),
      supabase
        .from("branches")
        .select("id, name")
        .eq("organization_id", tenant.organizationId)
        .eq("is_active", true)
        .order("name"),
      isAnnouncementsEnabled
        ? supabase
            .from("announcements")
            .select("id, title, kind, is_featured, publish_at, expires_at, branch_id")
            .eq("organization_id", tenant.organizationId)
            .order("publish_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] }),
      isChecklistsEnabled ? todayChecklistQuery : Promise.resolve({ count: 0 }),
      isChecklistsEnabled ? weekChecklistQuery : Promise.resolve({ count: 0 }),
      isChecklistsEnabled ? pendingReviewQuery : Promise.resolve({ count: 0 }),
      isChecklistsEnabled
        ? supabase
            .from("checklist_flags")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", tenant.organizationId)
            .in("status", ["open", "in_progress"])
        : Promise.resolve({ count: 0 }),
      isDocumentsEnabled
        ? supabase
            .from("documents")
            .select("id, title, created_at, branch_id, file_size_bytes")
.is('deleted_at', null)
            .eq("organization_id", tenant.organizationId)
            .order("created_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] }),
    ]);

  const branchNameMap = new Map((branches ?? []).map((item) => [item.id, item.name]));

  const moduleStatus = [
    { code: "documents", label: "Documentos", enabled: isDocumentsEnabled },
    { code: "announcements", label: "Avisos", enabled: isAnnouncementsEnabled },
    { code: "checklists", label: "Checklists", enabled: isChecklistsEnabled },
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
        employeesCount={(employeesCount ?? 0) + (usersCount ?? 0)}
        employeesOnlyCount={employeesCount ?? 0}
        usersOnlyCount={usersCount ?? 0}
        branchesCount={branchesCount ?? 0}
        checklistTodayCount={todayChecklistCount ?? 0}
        checklistWeekCount={weekChecklistCount ?? 0}
        pendingReviewCount={pendingReviewCount ?? 0}
        openFlagsCount={openFlagsCount ?? 0}
        announcements={announcements ?? []}
        recentDocuments={recentDocuments ?? []}
        branchNameMap={branchNameMap}
        moduleStatus={moduleStatus}
      />
    </>
  );
}
