import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { updateSupabaseSession } from "@/infrastructure/supabase/client/middleware";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
  normalizeOrganizationId,
} from "@/shared/lib/tenant-selection-shared";

let ratelimit: Ratelimit | null = null;

if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
  ratelimit = new Ratelimit({
    redis: new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    }),
    limiter: Ratelimit.slidingWindow(20, "10 s"),
    analytics: true,
  });
}

export async function proxy(request: NextRequest) {
  // Rate limit API and auth routes
  const path = request.nextUrl.pathname;

  const hasAuthCode = request.nextUrl.searchParams.has("code");
  const hasTokenHashFlow =
    request.nextUrl.searchParams.has("token_hash") &&
    request.nextUrl.searchParams.has("type");
  if ((hasAuthCode || hasTokenHashFlow) && path !== "/auth/callback") {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";

    if (!callbackUrl.searchParams.has("next")) {
      callbackUrl.searchParams.set("next", "/app/dashboard");
    }

    return NextResponse.redirect(callbackUrl);
  }

  if (ratelimit && (path.startsWith("/api/") || path.startsWith("/auth/"))) {
    const ip = request.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const { success, limit, reset, remaining } = await ratelimit.limit(ip);

    if (!success) {
      return NextResponse.json(
        { error: "Too Many Requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": remaining.toString(),
            "X-RateLimit-Reset": reset.toString(),
          },
        },
      );
    }
  }

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
