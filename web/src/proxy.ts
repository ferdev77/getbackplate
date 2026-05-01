import { NextResponse, type NextRequest } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { updateSupabaseSession } from "@/infrastructure/supabase/client/middleware";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  ACTIVE_ORGANIZATION_COOKIE_MAX_AGE,
  normalizeOrganizationId,
} from "@/shared/lib/tenant-selection-shared";
import { resolveUpstashConfig } from "@/shared/lib/upstash-env";

type DomainCacheEntry = {
  organizationId: string | null;
  expiresAt: number;
};

let ratelimit: Ratelimit | null = null;

const upstashConfig = resolveUpstashConfig();
if (upstashConfig) {
  ratelimit = new Ratelimit({
    redis: new Redis({
      url: upstashConfig.url,
      token: upstashConfig.token,
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
const domainResolutionCache = new Map<string, DomainCacheEntry>();
const DOMAIN_CACHE_TTL_MS = 60_000;
const DOMAIN_NEGATIVE_CACHE_TTL_MS = 15_000;
const DOMAIN_CACHE_MAX_SIZE = 2_000;

function getCachedOrganizationIdFromHost(host: string): string | null | undefined {
  const now = Date.now();
  const cached = domainResolutionCache.get(host);
  if (!cached) return undefined;

  if (cached.expiresAt <= now) {
    domainResolutionCache.delete(host);
    return undefined;
  }

  return cached.organizationId;
}

function setCachedOrganizationIdFromHost(host: string, organizationId: string | null) {
  if (domainResolutionCache.size >= DOMAIN_CACHE_MAX_SIZE) {
    let removed = 0;
    const now = Date.now();
    for (const [key, entry] of domainResolutionCache) {
      if (entry.expiresAt <= now) {
        domainResolutionCache.delete(key);
        removed += 1;
      }
      if (removed >= 256) break;
    }

    if (domainResolutionCache.size >= DOMAIN_CACHE_MAX_SIZE) {
      const oldestKey = domainResolutionCache.keys().next().value;
      if (oldestKey) {
        domainResolutionCache.delete(oldestKey);
      }
    }
  }

  domainResolutionCache.set(host, {
    organizationId,
    expiresAt: Date.now() + (organizationId ? DOMAIN_CACHE_TTL_MS : DOMAIN_NEGATIVE_CACHE_TTL_MS),
  });
}

/**
 * Returns true if the host is a reserved platform host that should NOT be
 * treated as a custom domain (localhost, *.vercel.app, the canonical app URL).
 */
function isReservedHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".vercel.app")) return true;
  if (canonicalAppHost && host === canonicalAppHost) return true;
  // ngrok tunnels used for local dev/webhook testing
  if (host.endsWith(".ngrok-free.dev") || host.endsWith(".ngrok-free.app") || host.endsWith(".ngrok.io")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
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
  const shouldBypassAuthCodeRedirect =
    path.startsWith("/api/company/integrations/qbo-r365/oauth/callback");

  if (
    !shouldBypassAuthCodeRedirect
    && (hasAuthCode || hasTokenHashFlow || hasTokenFlow)
    && !path.startsWith("/auth/callback")
  ) {
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
      const cachedOrganizationId = getCachedOrganizationIdFromHost(host);
      if (cachedOrganizationId !== undefined) {
        organizationIdFromHost = cachedOrganizationId;
      } else {
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
            .in("status", ["active", "verifying_ssl"])
            .maybeSingle();

          organizationIdFromHost = normalizeOrganizationId(data?.organization_id ?? null);
          setCachedOrganizationIdFromHost(host, organizationIdFromHost);
        }
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
