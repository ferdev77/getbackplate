import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getEnabledModules } from "@/modules/organizations/queries";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getEmployeeDocumentIdSet } from "@/shared/lib/document-domain";

async function getOpenFlagsCountByBranch(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  organizationId: string,
  branchId: string,
) {
  const { data: submissions } = await supabase
    .from("checklist_submissions")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .limit(2000);

  const submissionIds = (submissions ?? []).map((row) => row.id);
  if (!submissionIds.length) return 0;

  const { data: submissionItems } = await supabase
    .from("checklist_submission_items")
    .select("id")
    .eq("organization_id", organizationId)
    .in("submission_id", submissionIds)
    .limit(5000);

  const submissionItemIds = (submissionItems ?? []).map((row) => row.id);
  if (!submissionItemIds.length) return 0;

  const { count } = await supabase
    .from("checklist_flags")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ["open", "in_progress"])
    .in("submission_item_id", submissionItemIds);

  return count ?? 0;
}

export async function GET(request: Request) {
  const moduleAccess = await assertCompanyAdminModuleApi("dashboard");
  if (!moduleAccess.ok) {
    return NextResponse.json({ error: moduleAccess.error }, { status: moduleAccess.status });
  }

  const supabase = await createSupabaseServerClient();
  const organizationId = moduleAccess.tenant.organizationId;
  const { searchParams } = new URL(request.url);
  const selectedBranch = searchParams.get("branch")?.trim() ?? "";

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const enabledModuleCodes = await getEnabledModules(organizationId);
  const isDocumentsEnabled = enabledModuleCodes.has("documents");
  const isAnnouncementsEnabled = enabledModuleCodes.has("announcements");
  const isChecklistsEnabled = enabledModuleCodes.has("checklists");

  const employeesCountQueryBase = supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  const employeesCountQuery = selectedBranch
    ? employeesCountQueryBase.eq("branch_id", selectedBranch)
    : employeesCountQueryBase;

  const todayChecklistQueryBase = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", todayStart.toISOString());
  const todayChecklistQuery = selectedBranch
    ? todayChecklistQueryBase.eq("branch_id", selectedBranch)
    : todayChecklistQueryBase;

  const weekChecklistQueryBase = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("created_at", weekStart.toISOString());
  const weekChecklistQuery = selectedBranch
    ? weekChecklistQueryBase.eq("branch_id", selectedBranch)
    : weekChecklistQueryBase;

  const pendingReviewQueryBase = supabase
    .from("checklist_submissions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("status", "submitted");
  const pendingReviewQuery = selectedBranch
    ? pendingReviewQueryBase.eq("branch_id", selectedBranch)
    : pendingReviewQueryBase;

  const usersCountQueryBase = supabase
    .from("organization_user_profiles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_employee", false);
  const usersCountQuery = selectedBranch
    ? usersCountQueryBase.eq("branch_id", selectedBranch)
    : usersCountQueryBase;

  const branchesCountQueryBase = supabase
    .from("branches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  const branchesCountQuery = selectedBranch
    ? branchesCountQueryBase.eq("id", selectedBranch)
    : branchesCountQueryBase;

  const openFlagsCountPromise = isChecklistsEnabled
    ? selectedBranch
      ? getOpenFlagsCountByBranch(supabase, organizationId, selectedBranch)
      : supabase
          .from("checklist_flags")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", organizationId)
          .in("status", ["open", "in_progress"])
          .then(({ count }) => count ?? 0)
    : Promise.resolve(0);

  const [
    { count: employeesCount },
    { count: usersCount },
    { count: branchesCount },
    { count: todayChecklistCount },
    { count: weekChecklistCount },
    { count: pendingReviewCount },
    openFlagsCount,
    { data: announcements },
    { data: recentDocuments },
    employeeDocumentIds,
  ] = await Promise.all([
    employeesCountQuery,
    usersCountQuery,
    branchesCountQuery,
    isChecklistsEnabled ? todayChecklistQuery : Promise.resolve({ count: 0 }),
    isChecklistsEnabled ? weekChecklistQuery : Promise.resolve({ count: 0 }),
    isChecklistsEnabled ? pendingReviewQuery : Promise.resolve({ count: 0 }),
    openFlagsCountPromise,
    isAnnouncementsEnabled
      ? (() => {
          const query = supabase
            .from("announcements")
            .select("id, title, kind, is_featured, publish_at, expires_at, branch_id")
            .eq("organization_id", organizationId)
            .order("publish_at", { ascending: false })
            .limit(6);
          return selectedBranch ? query.eq("branch_id", selectedBranch) : query;
        })()
      : Promise.resolve({ data: [] }),
    isDocumentsEnabled
      ? (() => {
          const query = supabase
            .from("documents")
            .select("id, title, created_at, branch_id, file_size_bytes")
            .is("deleted_at", null)
            .eq("organization_id", organizationId)
            .order("created_at", { ascending: false })
            .limit(40);
          return selectedBranch ? query.eq("branch_id", selectedBranch) : query;
        })()
      : Promise.resolve({ data: [] }),
    isDocumentsEnabled
      ? getEmployeeDocumentIdSet(supabase, organizationId)
      : Promise.resolve(new Set<string>()),
  ]);

  const companyRecentDocuments = (recentDocuments ?? []).filter((doc) => !employeeDocumentIds.has(doc.id)).slice(0, 6);

  return NextResponse.json({
    employeesCount: (employeesCount ?? 0) + (usersCount ?? 0),
    employeesOnlyCount: employeesCount ?? 0,
    usersOnlyCount: usersCount ?? 0,
    branchesCount: branchesCount ?? 0,
    checklistTodayCount: todayChecklistCount ?? 0,
    checklistWeekCount: weekChecklistCount ?? 0,
    pendingReviewCount: pendingReviewCount ?? 0,
    openFlagsCount: openFlagsCount ?? 0,
    announcements: announcements ?? [],
    recentDocuments: companyRecentDocuments,
  });
}
