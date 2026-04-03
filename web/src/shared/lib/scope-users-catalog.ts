import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export type ScopeCatalogUser = {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  role_label: "Empleado" | "Usuario";
  location_label?: string;
  department_label?: string;
  position_label?: string;
};

export async function buildScopeUsersCatalog(organizationId: string): Promise<ScopeCatalogUser[]> {
  const admin = createSupabaseAdminClient();

  const [
    { data: customBrandingEnabled },
    { data: employees },
    { data: userProfiles },
    { data: memberships },
    { data: roles },
    { data: branches },
    { data: departments },
  ] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    admin
      .from("employees")
      .select("id, user_id, first_name, last_name, branch_id, department_id, position")
      .eq("organization_id", organizationId)
      .order("first_name"),
    admin
      .from("organization_user_profiles")
      .select("id, user_id, first_name, last_name")
      .eq("organization_id", organizationId)
      .eq("is_employee", false)
      .order("first_name"),
    admin
      .from("memberships")
      .select("user_id, role_id, status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    admin.from("roles").select("id, code"),
    admin
      .from("branches")
      .select("id, name, city")
      .eq("organization_id", organizationId),
    admin
      .from("organization_departments")
      .select("id, name")
      .eq("organization_id", organizationId),
  ]);

  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const employeeRoleUserIds = new Set(
    (memberships ?? [])
      .filter((membership) => roleCodeById.get(membership.role_id) === "employee")
      .map((membership) => membership.user_id)
      .filter(Boolean),
  );

  const branchNameById = new Map(
    (branches ?? []).map((row) => [row.id, customBrandingEnabled && row.city ? row.city : row.name]),
  );
  const departmentNameById = new Map((departments ?? []).map((row) => [row.id, row.name]));

  const catalog: ScopeCatalogUser[] = [];
  const userIdsInCatalog = new Set<string>();

  for (const employee of employees ?? []) {
    if (employee.user_id) {
      userIdsInCatalog.add(employee.user_id);
    }

    catalog.push({
      id: employee.id,
      user_id: employee.user_id,
      first_name: employee.first_name ?? "Usuario",
      last_name: employee.last_name ?? "",
      role_label: "Empleado",
      location_label: employee.branch_id ? branchNameById.get(employee.branch_id) ?? undefined : undefined,
      department_label: employee.department_id ? departmentNameById.get(employee.department_id) ?? undefined : undefined,
      position_label: employee.position ?? undefined,
    });
  }

  for (const profile of userProfiles ?? []) {
    if (profile.user_id && userIdsInCatalog.has(profile.user_id)) continue;
    catalog.push({
      id: `up-${profile.id}`,
      user_id: profile.user_id,
      first_name: profile.first_name ?? "Usuario",
      last_name: profile.last_name ?? "",
      role_label: "Usuario",
    });
    if (profile.user_id) {
      userIdsInCatalog.add(profile.user_id);
    }
  }

  for (const userId of employeeRoleUserIds) {
    if (!userId) continue;
    if (userIdsInCatalog.has(userId)) continue;
    catalog.push({
      id: `m-${userId}`,
      user_id: userId,
      first_name: "Usuario",
      last_name: userId.slice(0, 8),
      role_label: "Usuario",
    });
    userIdsInCatalog.add(userId);
  }

  return catalog;
}
