import { getAuthEmailByUserId } from "@/shared/lib/auth-users";

export type AudienceScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

export type AudienceContacts = {
  emails: string[];
  phones: string[];
  userIds: string[];
  /** Permite resolver el user_id a partir de un email resuelto, para el centro de notificaciones. */
  userIdByEmail: Record<string, string>;
};

type EmployeeRow = {
  user_id: string | null;
  branch_id: string | null;
  all_locations: boolean | null;
  location_scope_ids: string[] | null;
  department_id: string | null;
  position: string | null;
  phone_country_code: string | null;
  phone: string | null;
};

type ProfileRow = {
  user_id: string | null;
  branch_id: string | null;
  all_locations: boolean | null;
  location_scope_ids: string[] | null;
  department_id: string | null;
  position_id: string | null;
  phone: string | null;
};

type PositionRow = { id: string; name: string };
type MembershipRow = {
  user_id: string | null;
  branch_id: string | null;
  all_locations: boolean | null;
  location_scope_ids: string[] | null;
};
type BranchRow = { id: string };

export type AudienceResolverInput = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  scope: AudienceScope;
  templateBranchId?: string | null;
};

type MembershipScope = { branchIds: Set<string>; allLocations: boolean };

/**
 * Regla de Oro de Alcance (web/README_SCOPE_GOLDEN_RULE.md): dentro de una
 * dimension los valores usan OR, y las dimensiones pobladas se combinan con
 * AND. Antes esto resolvia todo con OR, asi que cumplir una sola dimension
 * bastaba para entrar en la audiencia y agregar un filtro no reducia nada:
 * un aviso para "Sucursal Centro + departamento Cocina" se notificaba a toda
 * la sucursal. Espeja announcement_scope_match / checklist_scope_match.
 */
function matchesScopeDimensions(params: {
  hasLocationFilter: boolean;
  hasDepartmentFilter: boolean;
  hasPositionFilter: boolean;
  byLocation: boolean;
  byDepartment: boolean;
  byPosition: boolean;
}) {
  return (
    (!params.hasLocationFilter || params.byLocation) &&
    (!params.hasDepartmentFilter || params.byDepartment) &&
    (!params.hasPositionFilter || params.byPosition)
  );
}

/**
 * Combina el alcance de sucursal de la membresia (login) con el de la
 * ficha propia (employees u organization_user_profiles) de una persona,
 * igual que ya hacen las funciones RLS de documentos/anuncios/checklists/
 * mantenimiento — cualquiera de las dos fichas puede tener guardado el
 * acceso multi-sucursal real.
 */
function computeEffectiveBranchIds(params: {
  ownBranchId: string | null;
  ownAllLocations: boolean | null;
  ownLocationScopeIds: string[] | null;
  membershipScope: MembershipScope | undefined;
  allOrgBranchIds: string[];
}): Set<string> {
  const hasAllLocations = Boolean(params.ownAllLocations) || Boolean(params.membershipScope?.allLocations);
  if (hasAllLocations) {
    return new Set(params.allOrgBranchIds);
  }

  const branchIds = new Set<string>();
  if (params.ownBranchId) branchIds.add(params.ownBranchId);
  for (const id of params.ownLocationScopeIds ?? []) branchIds.add(id);
  if (params.membershipScope) {
    for (const id of params.membershipScope.branchIds) branchIds.add(id);
  }
  return branchIds;
}

/**
 * Core audience resolution shared between announcements and checklists.
 * Fetches employees/profiles/memberships and matches them against a scope.
 */
export async function resolveAudienceContacts(input: AudienceResolverInput): Promise<AudienceContacts> {
  const { supabase, organizationId, scope, templateBranchId } = input;
  const { locations, department_ids, position_ids, users } = scope;

  const hasFilters = locations.length > 0 || department_ids.length > 0 || position_ids.length > 0;
  // Un alcance de solo personas es privado: sin filtros, la lista ES el
  // alcance y no una excepcion sobre una base.
  const isBroadcast = !hasFilters && users.length === 0;

  const [{ data: employees }, { data: positionRows }, { data: memberships }, { data: profiles }, { data: orgBranches }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("user_id, branch_id, all_locations, location_scope_ids, department_id, position, phone_country_code, phone, status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .not("user_id", "is", null),
      supabase
        .from("department_positions")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
      supabase
        .from("memberships")
        .select("user_id, branch_id, all_locations, location_scope_ids")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .not("user_id", "is", null),
      supabase
        .from("organization_user_profiles")
        .select("user_id, branch_id, all_locations, location_scope_ids, department_id, position_id, phone, status")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      supabase
        .from("branches")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("is_active", true),
    ]);

  const allOrgBranchIds = ((orgBranches as BranchRow[]) ?? []).map((row) => row.id).filter(Boolean);

  const membershipScopeByUser = new Map<string, MembershipScope>();
  for (const row of (memberships as MembershipRow[]) ?? []) {
    if (!row.user_id) continue;
    const existing = membershipScopeByUser.get(row.user_id) ?? { branchIds: new Set<string>(), allLocations: false };
    if (row.branch_id) existing.branchIds.add(row.branch_id);
    for (const id of row.location_scope_ids ?? []) existing.branchIds.add(id);
    if (row.all_locations) existing.allLocations = true;
    membershipScopeByUser.set(row.user_id, existing);
  }

  const positionIdsByName = new Map<string, string[]>();
  for (const row of (positionRows as PositionRow[]) ?? []) {
    const key = row.name.trim().toLowerCase();
    if (!key) continue;
    const list = positionIdsByName.get(key) ?? [];
    list.push(row.id);
    positionIdsByName.set(key, list);
  }

  const membershipUserIds = new Set(
    ((memberships as MembershipRow[]) ?? []).map((r) => r.user_id).filter(Boolean) as string[],
  );

  const recipientUserIds = new Set<string>();

  for (const emp of (employees as EmployeeRow[]) ?? []) {
    if (!emp.user_id) continue;

    const effectiveBranchIds = computeEffectiveBranchIds({
      ownBranchId: emp.branch_id,
      ownAllLocations: emp.all_locations,
      ownLocationScopeIds: emp.location_scope_ids,
      membershipScope: membershipScopeByUser.get(emp.user_id),
      allOrgBranchIds,
    });

    const byLocation = locations.length > 0 && locations.some((id) => effectiveBranchIds.has(id));
    const byDepartment =
      department_ids.length > 0 && Boolean(emp.department_id) && department_ids.includes(emp.department_id!);
    const empPositionIds = emp.position
      ? (positionIdsByName.get(emp.position.trim().toLowerCase()) ?? [])
      : [];
    const byPosition = position_ids.length > 0 && empPositionIds.some((id) => position_ids.includes(id));
    const byUser = users.length > 0 && users.includes(emp.user_id);

    // La sucursal propia de la plantilla filtra antes que el alcance, igual que
    // el corte temprano de can_read_announcement / can_read_checklist_template.
    const passesTemplateBranch = !templateBranchId || effectiveBranchIds.has(templateBranchId);

    const isInAudience =
      byUser ||
      (passesTemplateBranch &&
        (hasFilters
          ? matchesScopeDimensions({
              hasLocationFilter: locations.length > 0,
              hasDepartmentFilter: department_ids.length > 0,
              hasPositionFilter: position_ids.length > 0,
              byLocation,
              byDepartment,
              byPosition,
            })
          : isBroadcast));

    if (isInAudience) recipientUserIds.add(emp.user_id);
  }

  for (const profile of (profiles as ProfileRow[]) ?? []) {
    if (!profile.user_id) continue;

    const effectiveBranchIds = computeEffectiveBranchIds({
      ownBranchId: profile.branch_id,
      ownAllLocations: profile.all_locations,
      ownLocationScopeIds: profile.location_scope_ids,
      membershipScope: membershipScopeByUser.get(profile.user_id),
      allOrgBranchIds,
    });

    const byLocation = locations.length > 0 && locations.some((id) => effectiveBranchIds.has(id));
    const byDepartment =
      department_ids.length > 0 && Boolean(profile.department_id) && department_ids.includes(profile.department_id!);
    const byPosition =
      position_ids.length > 0 && Boolean(profile.position_id) && position_ids.includes(profile.position_id!);
    const byUser = users.length > 0 && users.includes(profile.user_id);

    const passesTemplateBranch = !templateBranchId || effectiveBranchIds.has(templateBranchId);

    const isInAudience =
      byUser ||
      (passesTemplateBranch &&
        (hasFilters
          ? matchesScopeDimensions({
              hasLocationFilter: locations.length > 0,
              hasDepartmentFilter: department_ids.length > 0,
              hasPositionFilter: position_ids.length > 0,
              byLocation,
              byDepartment,
              byPosition,
            })
          : isBroadcast));

    if (isInAudience) recipientUserIds.add(profile.user_id);
  }

  if (isBroadcast && !templateBranchId) {
    for (const userId of membershipUserIds) recipientUserIds.add(userId);
  }

  for (const userId of users) recipientUserIds.add(userId);

  const emailByUserId = await getAuthEmailByUserId([...recipientUserIds]);
  const emails = [...new Set([...emailByUserId.values()].filter(Boolean))] as string[];
  const userIdByEmail: Record<string, string> = {};
  for (const [userId, email] of emailByUserId) {
    if (email) userIdByEmail[email] = userId;
  }

  const phones = new Set<string>();
  for (const emp of (employees as EmployeeRow[]) ?? []) {
    if (!emp.user_id || !recipientUserIds.has(emp.user_id) || !emp.phone) continue;
    const code = (emp.phone_country_code ?? "").replace(/[^0-9+]/g, "");
    const number = emp.phone.replace(/[^0-9]/g, "");
    if (!number) continue;
    const full =
      code && !number.startsWith(code) && !number.startsWith(code.replace("+", ""))
        ? `${code}${number}`
        : number.startsWith("+")
          ? number
          : `+${number}`;
    phones.add(full);
  }
  for (const profile of (profiles as ProfileRow[]) ?? []) {
    if (!profile.user_id || !recipientUserIds.has(profile.user_id) || !profile.phone) continue;
    const number = profile.phone.replace(/[^0-9+]/g, "");
    if (!number) continue;
    phones.add(number.startsWith("+") ? number : `+${number}`);
  }

  return {
    emails,
    phones: [...phones],
    userIds: [...recipientUserIds],
    userIdByEmail,
  };
}
