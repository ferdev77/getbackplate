import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { hasMissingColumnError } from "@/shared/lib/supabase-compat";
import { resolveAnnouncementAuthorNames } from "@/modules/announcements/lib/authors";
import { extractDisplayName } from "@/shared/lib/user";

export async function getAnnouncementPageData(organizationId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: authData } = await supabase.auth.getUser();

  const { data: announcements, error: annError } = await supabase
    .from("announcements")
    .select("id, title, body, kind, is_featured, publish_at, created_at, expires_at, branch_id, target_scope, created_by")
    .eq("organization_id", organizationId)
    .order("publish_at", { ascending: false })
    .limit(100);

  if (annError) {
    console.error("[announcements] Error fetching announcements:", annError);
  }

  const fetchOrderedBranches = async () => {
    const primary = await supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return primary.data ?? [];

    const fallback = await supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    return fallback.data ?? [];
  };

  const fetchOrderedDepartments = async () => {
    const primary = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return primary.data ?? [];

    const fallback = await supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("name", { ascending: true });
    return fallback.data ?? [];
  };

  const fetchOrderedPositions = async () => {
    const primary = await supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (!hasMissingColumnError(primary.error, "sort_order")) return primary.data ?? [];

    const fallback = await supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("department_id", { ascending: true })
      .order("name", { ascending: true });
    return fallback.data ?? [];
  };

  const [
    branches,
    { data: employees },
    { data: userProfiles },
    departments,
    positions,
    { data: memberships },
    { data: roles },
  ] = await Promise.all([
    fetchOrderedBranches(),
    supabase
      .from("employees")
      .select("id, user_id, first_name, last_name, branch_id, department_id, position")
      .eq("organization_id", organizationId),
    supabase
      .from("organization_user_profiles")
      .select("id, user_id, first_name, last_name")
      .eq("organization_id", organizationId)
      .eq("is_employee", false),
    fetchOrderedDepartments(),
    fetchOrderedPositions(),
    supabase
      .from("memberships")
      .select("user_id, role_id, status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase.from("roles").select("id, code"),
  ]);

  const enabledModulesArr = await getEnabledModulesCached(organizationId);
  const enabledModules = new Set(enabledModulesArr);
  const customBrandingEnabled = enabledModules.has("custom_branding");

  const mappedBranches = branches.map((b) => ({
    ...b,
    name: customBrandingEnabled && b.city ? b.city : b.name,
  }));

  const branchNameMap = new Map(mappedBranches.map((row) => [row.id, row.name]));
  const departmentNameMap = new Map(departments.map((row) => [row.id, row.name]));
  const positionNameMap = new Map(positions.map((row) => [row.id, row.name]));

  const authorIds = Array.from(
    new Set((announcements ?? []).map((ann) => ann.created_by).filter(Boolean)),
  );
  const authorNameMap = await resolveAnnouncementAuthorNames({ organizationId, authorIds });

  const roleCodeById = new Map((roles ?? []).map((row) => [row.id, row.code]));
  const adminUserIds = new Set(
    (memberships ?? [])
      .filter((row) => roleCodeById.get(row.role_id) === "company_admin")
      .map((row) => row.user_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0),
  );

  const employeeNameByUserId = new Map(
    (employees ?? [])
      .filter((row) => row.user_id)
      .map((row) => [row.user_id as string, `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim()]),
  );
  for (const profile of userProfiles ?? []) {
    if (!profile.user_id) continue;
    if (employeeNameByUserId.has(profile.user_id)) continue;
    employeeNameByUserId.set(
      profile.user_id,
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Usuario",
    );
  }

  const scopeUsers = await buildScopeUsersCatalog(organizationId);

  return {
    announcements: announcements ?? [],
    branches: mappedBranches,
    departments,
    positions,
    branchNameMap,
    departmentNameMap,
    positionNameMap,
    authorNameMap,
    employeeNameByUserId,
    adminUserIds,
    scopeUsers,
    publisherName: extractDisplayName(authData.user),
  };
}
