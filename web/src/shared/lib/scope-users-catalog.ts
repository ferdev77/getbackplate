import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";

export type ScopeCatalogUser = {
  id: string;
  user_id: string | null;
  branch_id?: string | null;
  /**
   * Todas las locaciones que alcanza la persona: su sucursal, las asignadas, o
   * todas si tiene ese permiso. El servidor decide con este conjunto
   * (can_read_checklist_template y audience-resolver), asi que la vista previa
   * tiene que mirar lo mismo. Con solo branch_id, alguien asignado a varias
   * locaciones no aparecia al filtrar por una que no fuera la suya.
   */
  location_ids?: string[];
  /**
   * Los ids van ademas de las etiquetas porque la vista previa del selector de
   * alcance tiene que decidir igual que el servidor. El servidor compara por
   * position_id desde la migracion 20260729000005; si la previa comparara solo
   * por nombre, un empleado con el texto viejo en `position` se mostraria en un
   * grupo al que en realidad no pertenece (o al reves).
   */
  department_id?: string | null;
  position_id?: string | null;
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
    { data: positions },
  ] = await Promise.all([
    admin.rpc("is_module_enabled", { org_id: organizationId, module_code: "custom_branding" }),
    admin
      .from("employees")
      .select("id, user_id, first_name, last_name, branch_id, department_id, position, position_id, all_locations, location_scope_ids")
      .eq("organization_id", organizationId)
      .order("first_name"),
    admin
      .from("organization_user_profiles")
      .select("id, user_id, first_name, last_name")
      .eq("organization_id", organizationId)
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
    admin
      .from("department_positions")
      .select("id, name")
      .eq("organization_id", organizationId),
  ]);

  const roleCodeById = new Map((roles ?? []).map((role) => [role.id, role.code]));
  const roleCodeByUserId = new Map(
    (memberships ?? [])
      .filter((membership) => Boolean(membership.user_id))
      .map((membership) => [membership.user_id as string, roleCodeById.get(membership.role_id) ?? null]),
  );
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
  const positionNameById = new Map((positions ?? []).map((row) => [row.id, row.name]));

  const todasLasLocaciones = (branches ?? []).map((row) => row.id).filter(Boolean);

  function locacionesDe(employee: {
    branch_id: string | null;
    all_locations: boolean | null;
    location_scope_ids: string[] | null;
  }) {
    if (employee.all_locations) return todasLasLocaciones;
    const propias = [
      employee.branch_id,
      ...(Array.isArray(employee.location_scope_ids) ? employee.location_scope_ids : []),
    ];
    return [...new Set(propias.filter((id): id is string => Boolean(id)))];
  }

  const catalog: ScopeCatalogUser[] = [];
  const userIdsInCatalog = new Set<string>();

  for (const employee of employees ?? []) {
    if (employee.user_id) {
      userIdsInCatalog.add(employee.user_id);
    }

    catalog.push({
      id: employee.id,
      user_id: employee.user_id,
      branch_id: employee.branch_id,
      location_ids: locacionesDe(employee),
      department_id: employee.department_id,
      position_id: employee.position_id,
      first_name: employee.first_name ?? "Usuario",
      last_name: employee.last_name ?? "",
      role_label: "Empleado",
      location_label: employee.branch_id ? branchNameById.get(employee.branch_id) ?? undefined : undefined,
      department_label: employee.department_id ? departmentNameById.get(employee.department_id) ?? undefined : undefined,
      // El nombre del puesto real manda sobre el texto libre heredado: si los
      // dos existen y difieren, el que decide el acceso es el del position_id.
      position_label:
        (employee.position_id ? positionNameById.get(employee.position_id) : undefined) ??
        employee.position ??
        undefined,
    });
  }

  for (const profile of userProfiles ?? []) {
    if (profile.user_id && userIdsInCatalog.has(profile.user_id)) continue;
    if (profile.user_id && !roleCodeByUserId.has(profile.user_id)) continue;
    const isEmployee = profile.user_id && roleCodeByUserId.get(profile.user_id) === "employee";
    const roleLabel = isEmployee ? "Empleado" : "Usuario";
    catalog.push({
      id: `up-${profile.id}`,
      user_id: profile.user_id,
      branch_id: null,
      first_name: profile.first_name ?? "Usuario",
      last_name: profile.last_name ?? "",
      role_label: roleLabel,
      position_label: isEmployee ? undefined : "Admin Company",
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
      branch_id: null,
      first_name: "Empleado",
      last_name: userId.slice(0, 8),
      role_label: "Empleado",
    });
    userIdsInCatalog.add(userId);
  }

  return catalog;
}
