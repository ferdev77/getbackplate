import { cookies } from "next/headers";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
  normalizeOrganizationId,
} from "@/shared/lib/tenant-selection-shared";
import { getCurrentUserMemberships } from "@/modules/memberships/queries";

export { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_ORGANIZATION_COOKIE_MAX_AGE, normalizeOrganizationId };

export async function getActiveOrganizationIdFromCookie() {
  const store = await cookies();
  return normalizeOrganizationId(store.get(ACTIVE_ORGANIZATION_COOKIE)?.value);
}

/**
 * Same as getActiveOrganizationIdFromCookie, but when the cookie is missing
 * (e.g. a redirect chain that never had a chance to set it) falls back to the
 * user's sole active membership. Returns null if the cookie is absent AND the
 * user has zero or multiple memberships (ambiguous, requires explicit selection).
 */
export async function getActiveOrganizationIdWithFallback() {
  const cookieOrganizationId = await getActiveOrganizationIdFromCookie();
  if (cookieOrganizationId) return cookieOrganizationId;

  const memberships = await getCurrentUserMemberships();
  const organizationIds = [...new Set(memberships.map((m) => m.organizationId))];
  return organizationIds.length === 1 ? organizationIds[0] : null;
}

export async function setActiveOrganizationIdCookie(organizationId: string) {
  const store = await cookies();
  store.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
  });
}

export async function clearActiveOrganizationIdCookie() {
  const store = await cookies();
  store.delete(ACTIVE_ORGANIZATION_COOKIE);
}
