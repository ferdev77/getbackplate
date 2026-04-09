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

/**
 * Resolve the canonical app hostname from NEXT_PUBLIC_APP_URL.
 * Runs only once and is memoised for the lifetime of the worker.
 */
function getCanonicalAppHost(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname.toLowerCase();
  } catch {
    return "";
  }
}

const canonicalAppHost = getCanonicalAppHost();

/**
 * Returns true if the host is a reserved platform host that should NOT be
 * treated as a custom domain (localhost, *.vercel.app, the canonical app URL).
 */
function isReservedHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".vercel.app")) return true;
  if (canonicalAppHost && host === canonicalAppHost) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  // Rate limit API and auth routes
  const path = request.nextUrl.pathname;
  const method = request.method.toUpperCase();

  const authType = request.nextUrl.searchParams.get("type");
  const isSupportedAuthType =
    authType === "recovery" ||
    authType === "email" ||
    authType === "invite" ||
    authType === "magiclink";
  const hasAuthCode = request.nextUrl.searchParams.has("code");
  const hasTokenHashFlow = request.nextUrl.searchParams.has("token_hash") && isSupportedAuthType;
  const hasTokenFlow = request.nextUrl.searchParams.has("token") && isSupportedAuthType;

  if ((hasAuthCode || hasTokenHashFlow || hasTokenFlow) && !path.startsWith("/auth/callback")) {
    const callbackUrl = request.nextUrl.clone();
    callbackUrl.pathname = "/auth/callback";

    if (!callbackUrl.searchParams.has("next")) {
      callbackUrl.searchParams.set(
        "next",
        authType === "recovery" ? "/auth/change-password?reason=recovery" : "/app/dashboard",
      );
    }

    return NextResponse.redirect(callbackUrl);
  }

  const shouldRateLimit = path.startsWith("/api/") || (path.startsWith("/auth/") && method !== "GET");

  if (ratelimit && shouldRateLimit) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = (forwardedFor ? forwardedFor.split(",")[0]?.trim() : null) ?? realIp ?? "127.0.0.1";
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

  // ─── Org cookie resolution ───────────────────────────────────────────────
  //
  // Priority order:
  //  1. Custom domain host (if it resolves to an active organization).
  //  2. Explicit ?org= query param.
  //
  const organizationIdFromUrl = normalizeOrganizationId(
    request.nextUrl.searchParams.get("org"),
  );

  let organizationIdFromHost: string | null = null;
  const rawHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    "";
  const host = rawHost.split(":")[0]?.trim().toLowerCase() ?? "";

  if (!isReservedHost(host)) {
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

      if (supabaseUrl && serviceKey) {
        const admin = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { data } = await admin
          .from("organization_domains")
          .select("organization_id")
          .eq("domain", host)
          .eq("status", "active")
          .maybeSingle();

        organizationIdFromHost = normalizeOrganizationId(data?.organization_id ?? null);
      }
    } catch {
      // Non-fatal: if resolution fails, continue with URL-based org resolution.
      organizationIdFromHost = null;
    }
  }

  const organizationIdToPersist = organizationIdFromHost ?? organizationIdFromUrl;

  if (organizationIdToPersist) {
    response.cookies.set(ACTIVE_ORGANIZATION_COOKIE, organizationIdToPersist, {
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
