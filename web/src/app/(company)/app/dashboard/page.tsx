import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireTenantModule } from "@/shared/lib/access";
import { CompanyDashboardWorkspace } from "@/shared/ui/company-dashboard-workspace";

type CompanyDashboardPageProps = {
  searchParams: Promise<{ branch?: string; q?: string; selectPlanId?: string }>;
};

export default async function CompanyDashboardPage({ searchParams }: CompanyDashboardPageProps) {
  const tenant = await requireTenantModule("dashboard");
  const supabase = await createSupabaseServerClient();
  const params = await searchParams;
  const branchFilter = params.branch?.trim() ?? "";
  const searchTerm = params.q?.trim() ?? "";
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const [
    { data: documentsEnabled },
    { data: announcementsEnabled },
    { data: checklistEnabled },
    { data: reportsEnabled },
    { data: employeesEnabled },
  ] = await Promise.all([
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
    supabase.rpc("is_module_enabled", {
      org_id: tenant.organizationId,
      module_code: "employees",
    }),
  ]);

  const isDocumentsEnabled = Boolean(documentsEnabled);
  const isAnnouncementsEnabled = Boolean(announcementsEnabled);
  const isChecklistsEnabled = Boolean(checklistEnabled);
  const isReportsEnabled = Boolean(reportsEnabled);
  const isEmployeesEnabled = Boolean(employeesEnabled);

  const employeesCountQuery = supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId);
  if (branchFilter) {
    employeesCountQuery.eq("branch_id", branchFilter);
  }

  const todayChecklistQuery = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId)
    .gte("created_at", todayStart.toISOString());
  if (branchFilter) {
    todayChecklistQuery.eq("branch_id", branchFilter);
  }

  const weekChecklistQuery = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId)
    .gte("created_at", weekStart.toISOString());
  if (branchFilter) {
    weekChecklistQuery.eq("branch_id", branchFilter);
  }

  const pendingReviewQuery = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", tenant.organizationId)
    .eq("status", "submitted");
  if (branchFilter) {
    pendingReviewQuery.eq("branch_id", branchFilter);
  }

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
    { data: orgSettings },
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
            .eq("organization_id", tenant.organizationId)
            .order("created_at", { ascending: false })
            .limit(6)
        : Promise.resolve({ data: [] }),
      supabase
        .from("organization_settings")
        .select("dashboard_note")
        .eq("organization_id", tenant.organizationId)
        .maybeSingle(),
    ]);

  const branchNameMap = new Map((branches ?? []).map((item) => [item.id, item.name]));
  const selectedBranchName = branchFilter ? branchNameMap.get(branchFilter) ?? null : null;

  const filteredAnnouncements = (announcements ?? []).filter((item) => {
    const branchMatch = !branchFilter || item.branch_id === branchFilter;
    const queryMatch =
      !searchTerm || item.title.toLowerCase().includes(searchTerm.toLowerCase());
    return branchMatch && queryMatch;
  });

  const filteredDocuments = (recentDocuments ?? []).filter((item) => {
    const branchMatch = !branchFilter || item.branch_id === branchFilter;
    const queryMatch =
      !searchTerm || item.title.toLowerCase().includes(searchTerm.toLowerCase());
    return branchMatch && queryMatch;
  });

  const moduleStatus = [
    { code: "documents", label: "Documentos", enabled: isDocumentsEnabled },
    { code: "announcements", label: "Avisos", enabled: isAnnouncementsEnabled },
    { code: "checklists", label: "Checklists", enabled: isChecklistsEnabled },
    { code: "reports", label: "Reportes", enabled: isReportsEnabled },
    { code: "employees", label: "Usuarios / Empleados", enabled: isEmployeesEnabled },
  ];

  const selectPlanId = params?.selectPlanId;
  const plans = selectPlanId ? await import("@/modules/plans/queries").then(m => m.getActivePlans()) : [];
  const LandingPricing = selectPlanId ? (await import("@/shared/ui/landing-components")).LandingPricing : null;

  return (
    <>
      {selectPlanId && LandingPricing ? (
         <div className="mx-auto max-w-7xl pt-8 px-4 sm:px-6">
           <div className="rounded-2xl bg-brand/5 border border-brand/20 p-6 text-center shadow-sm">
             <h2 className="text-xl font-bold text-brand mb-2">¡Cuenta creada con éxito!</h2>
             <p className="text-sm text-foreground mb-1">Para habilitar tu organización, necesitas completar la suscripción de tu plan.</p>
             <p className="text-xs text-muted-foreground">Tu progreso ha sido guardado automáticamente.</p>
           </div>
           {/* Render compact version of pricing with the selected plan highlighted */}
           <LandingPricing plans={plans} highlightPlanId={selectPlanId as string} compact={true} />
         </div>
      ) : null}
      
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
        announcements={filteredAnnouncements}
        recentDocuments={filteredDocuments}
        branchNameMap={branchNameMap}
        branches={branches ?? []}
        branchFilter={branchFilter}
        selectedBranchName={selectedBranchName}
        searchTerm={searchTerm}
        dashboardNote={orgSettings?.dashboard_note ?? ""}
        moduleStatus={moduleStatus}
      />
    </>
  );
}
