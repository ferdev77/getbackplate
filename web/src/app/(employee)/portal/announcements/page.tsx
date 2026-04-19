import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { requireEmployeeAccess } from "@/shared/lib/access";
import { canReadAnnouncementInTenant } from "@/shared/lib/announcement-access";
import { getEnabledModulesCached } from "@/modules/organizations/cached-queries";
import { getEmployeeDelegatedPermissionsByMembership } from "@/shared/lib/employee-module-permissions";
import { EmployeeAnnouncementsWorkspace } from "@/modules/announcements/ui/employee-announcements-workspace";
import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";
import { extractDisplayName } from "@/shared/lib/user";

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
  const hasAnnouncementsModule = new Set(enabledModules).has("announcements");
  const publisherName = extractDisplayName(authData.user);
  const delegatedPermissions = await getEmployeeDelegatedPermissionsByMembership(
    tenant.organizationId,
    tenant.membershipId,
  );
  const canCreate = delegatedPermissions.announcements.create;
  const canEdit = delegatedPermissions.announcements.edit;
  const canDelete = delegatedPermissions.announcements.delete;

  let announcements: AnnouncementRow[] = [];

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
  }

  const myAnnouncements = announcements.filter((row) => row.created_by === userId);

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
    name: branch.name,
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
        publisherName={publisherName}
        branches={mappedBranches}
        departments={departments ?? []}
        positions={positions ?? []}
        users={scopeUsers}
      />
    </div>
  );
}
