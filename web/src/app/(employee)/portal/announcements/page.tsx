import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { canReadAnnouncementInTenant } from "@/shared/lib/announcement-access";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { EmployeeAnnouncementsWorkspace } from "@/modules/announcements/ui/employee-announcements-workspace";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { extractDisplayName } from "@/shared/lib/user";
import { resolveAnnouncementAuthorNames } from "@/shared/lib/announcement-authors";
import { getBranchDisplayName } from "@/shared/lib/branch-display";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  kind: "urgent" | "reminder" | "celebration" | "general" | string | null;
  is_featured: boolean;
  publish_at: string | null;
  created_at: string;
  expires_at: string | null;
  target_scope: unknown;
  created_by: string | null;
  created_by_name?: string;
};

export default async function EmployeeAnnouncementsPage() {
  const tenant = await requireEmployeeAccess();
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;

  if (!userId) {
    return null;
  }

  const { data: employeeRow } = await supabase
    .from("employees")
    .select("department_id, position, branch_id")
    .eq("organization_id", tenant.organizationId)
    .eq("user_id", userId)
    .maybeSingle();

  let employeePositionIds: string[] = [];
  if (employeeRow?.position) {
    const { data: positionRows } = await supabase
      .from("department_positions")
      .select("id")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .eq("name", employeeRow.position)
      .limit(20);

    employeePositionIds = (positionRows ?? []).map((row) => row.id);
  }

  const enabledModules = await getEnabledModulesCached(tenant.organizationId);
  const enabledModulesSet = new Set(enabledModules);
  const hasAnnouncementsModule = enabledModulesSet.has("announcements");
  const customBrandingEnabled = enabledModulesSet.has("custom_branding");
  const publisherName = extractDisplayName(authData.user);
  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );
  const canCreate = delegatedPermissions.announcements.create;
  const canEdit = delegatedPermissions.announcements.edit;
  const canDelete = delegatedPermissions.announcements.delete;

  let announcements: AnnouncementRow[] = [];
  let myAnnouncements: AnnouncementRow[] = [];

  if (hasAnnouncementsModule) {
    const now = new Date();
    const { data } = await supabase
      .from("announcements")
      .select("id, title, body, kind, is_featured, publish_at, created_at, expires_at, target_scope, created_by")
      .eq("organization_id", tenant.organizationId)
      .order("publish_at", { ascending: false })
      .limit(60);

    const announcementTimestamp = (row: { publish_at: string | null; created_at: string }) => {
      const dateValue = row.publish_at ?? row.created_at;
      const timestamp = new Date(dateValue).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    announcements = (data ?? []).filter((item) => {
      if (item.created_by === userId) {
        return true;
      }

      const publishAt = item.publish_at ? new Date(item.publish_at) : null;
      const expiresAt = item.expires_at ? new Date(item.expires_at) : null;
      const published = !publishAt || publishAt <= now;
      const notExpired = !expiresAt || expiresAt >= now;
      if (!published || !notExpired) return false;

      return canReadAnnouncementInTenant({
        roleCode: tenant.roleCode,
        userId,
        branchId: tenant.branchId ?? employeeRow?.branch_id ?? null,
        departmentId: employeeRow?.department_id ?? null,
        positionIds: employeePositionIds,
        targetScope: item.target_scope,
      });
    }).sort((a, b) => {
      if (Boolean(a.is_featured) !== Boolean(b.is_featured)) {
        return a.is_featured ? -1 : 1;
      }
      return announcementTimestamp(b) - announcementTimestamp(a);
    });

    const { data: createdByMeData } = await supabase
      .from("announcements")
      .select("id, title, body, kind, is_featured, publish_at, created_at, expires_at, target_scope, created_by")
      .eq("organization_id", tenant.organizationId)
      .eq("created_by", userId)
      .order("created_at", { ascending: false })
      .limit(60);

    myAnnouncements = (createdByMeData ?? []).sort((a, b) => {
      if (Boolean(a.is_featured) !== Boolean(b.is_featured)) {
        return a.is_featured ? -1 : 1;
      }
      return announcementTimestamp(b) - announcementTimestamp(a);
    });

    const authorIds = Array.from(
      new Set(
        [...announcements, ...myAnnouncements]
          .map((row) => row.created_by)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    const authorNameMap = await resolveAnnouncementAuthorNames({
      organizationId: tenant.organizationId,
      authorIds,
    });

    announcements = announcements.map((row) => ({
      ...row,
      created_by_name: row.created_by ? authorNameMap.get(row.created_by) ?? "Dirección" : "Dirección",
    }));

    myAnnouncements = myAnnouncements.map((row) => ({
      ...row,
      created_by_name: row.created_by ? authorNameMap.get(row.created_by) ?? "Dirección" : "Dirección",
    }));
  }

  const [{ data: branches }, { data: departments }, { data: positions }, scopeUsers] = await Promise.all([
    supabase
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("department_positions")
      .select("id, department_id, name")
      .eq("organization_id", tenant.organizationId)
      .eq("is_active", true)
      .order("name"),
    buildScopeUsersCatalog(tenant.organizationId),
  ]);

  const mappedBranches = (branches ?? []).map((branch) => ({
    id: branch.id,
    name: getBranchDisplayName(branch, customBrandingEnabled),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-[var(--gbp-text)]">Avisos</h1>
        <p className="mt-1 text-sm text-[var(--gbp-text2)]">Directivas y comunicaciones de la empresa.</p>
      </header>

      <EmployeeAnnouncementsWorkspace
        visibleAnnouncements={announcements}
        myAnnouncements={myAnnouncements}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        viewerUserId={userId}
        publisherName={publisherName}
        branches={mappedBranches}
        departments={departments ?? []}
        positions={positions ?? []}
        users={scopeUsers}
      />
    </div>
  );
}
