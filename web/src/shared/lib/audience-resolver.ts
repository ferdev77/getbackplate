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
};

type EmployeeRow = {
  user_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  position: string | null;
  phone_country_code: string | null;
  phone: string | null;
};

type ProfileRow = {
  user_id: string | null;
  branch_id: string | null;
  department_id: string | null;
  position_id: string | null;
  phone: string | null;
};

type PositionRow = { id: string; name: string };
type MembershipRow = { user_id: string | null };

export type AudienceResolverInput = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  organizationId: string;
  scope: AudienceScope;
  templateBranchId?: string | null;
};

/**
 * Core audience resolution shared between announcements and checklists.
 * Fetches employees/profiles/memberships and matches them against a scope.
 */
export async function resolveAudienceContacts(input: AudienceResolverInput): Promise<AudienceContacts> {
  const { supabase, organizationId, scope, templateBranchId } = input;
  const { locations, department_ids, position_ids, users } = scope;

  const hasSpecificScope =
    locations.length > 0 || department_ids.length > 0 || position_ids.length > 0 || users.length > 0;

  const [{ data: employees }, { data: positionRows }, { data: memberships }, { data: profiles }] = await Promise.all([
    supabase
      .from("employees")
      .select("user_id, branch_id, department_id, position, phone_country_code, phone, status")
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
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .not("user_id", "is", null),
    supabase
      .from("organization_user_profiles")
      .select("user_id, branch_id, department_id, position_id, phone, status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

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

    const byTemplateBranch = Boolean(templateBranchId) && emp.branch_id === templateBranchId;
    const byLocation = locations.length > 0 && Boolean(emp.branch_id) && locations.includes(emp.branch_id!);
    const byDepartment =
      department_ids.length > 0 && Boolean(emp.department_id) && department_ids.includes(emp.department_id!);
    const empPositionIds = emp.position
      ? (positionIdsByName.get(emp.position.trim().toLowerCase()) ?? [])
      : [];
    const byPosition = position_ids.length > 0 && empPositionIds.some((id) => position_ids.includes(id));
    const byUser = users.length > 0 && users.includes(emp.user_id);

    const isInAudience = hasSpecificScope
      ? byLocation || byDepartment || byPosition || byUser
      : byTemplateBranch || !templateBranchId;

    if (isInAudience) recipientUserIds.add(emp.user_id);
  }

  for (const profile of (profiles as ProfileRow[]) ?? []) {
    if (!profile.user_id) continue;

    const byTemplateBranch = Boolean(templateBranchId) && profile.branch_id === templateBranchId;
    const byLocation =
      locations.length > 0 && Boolean(profile.branch_id) && locations.includes(profile.branch_id!);
    const byDepartment =
      department_ids.length > 0 && Boolean(profile.department_id) && department_ids.includes(profile.department_id!);
    const byPosition =
      position_ids.length > 0 && Boolean(profile.position_id) && position_ids.includes(profile.position_id!);
    const byUser = users.length > 0 && users.includes(profile.user_id);

    const isInAudience = hasSpecificScope
      ? byLocation || byDepartment || byPosition || byUser
      : byTemplateBranch || !templateBranchId;

    if (isInAudience) recipientUserIds.add(profile.user_id);
  }

  if (!hasSpecificScope && !templateBranchId) {
    for (const userId of membershipUserIds) recipientUserIds.add(userId);
  }

  for (const userId of users) recipientUserIds.add(userId);

  const emailByUserId = await getAuthEmailByUserId([...recipientUserIds]);
  const emails = [...new Set([...emailByUserId.values()].filter(Boolean))] as string[];

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
  };
}
