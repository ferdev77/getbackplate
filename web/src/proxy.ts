import { type NextRequest } from "next/server";

import { updateSupabaseSession } from "@/infrastructure/supabase/client/middleware";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
  normalizeOrganizationId,
} from "@/shared/lib/tenant-selection-shared";

export async function proxy(request: NextRequest) {
  const response = await updateSupabaseSession(request);
  const organizationIdFromUrl = normalizeOrganizationId(
    request.nextUrl.searchParams.get("org"),
  );

  if (organizationIdFromUrl) {
    response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationIdFromUrl, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
