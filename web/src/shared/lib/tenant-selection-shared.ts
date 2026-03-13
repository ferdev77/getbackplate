export const ACTIVE_ORGANIZATION_COOKIE = "gb_active_org_id";
export const ACTIVE_ORGANIZATION_COOKIE_MAX_AGE = 60 * 60 * 24 * 90;

export function normalizeOrganizationId(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
