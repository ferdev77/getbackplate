import { cookies } from "next/headers";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
  normalizeOrganizationId,
} from "@/shared/lib/tenant-selection-shared";

export { ACTIVE_ORGANIZATION_COOKIE, ACTIVE_ORGANIZATION_COOKIE_MAX_AGE, normalizeOrganizationId };

export async function getActiveOrganizationIdFromCookie() {
  const store = await cookies();
  return normalizeOrganizationId(store.get(ACTIVE_ORGANIZATION_COOKIE)?.value);
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
