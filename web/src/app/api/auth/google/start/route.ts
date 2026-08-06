import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getCanonicalAppUrl, getRequestOrigin } from "@/shared/lib/app-url";
import { normalizeOrganizationId } from "@/shared/lib/tenant-selection-shared";
import {
  normalizeRequestHost,
  resolveOrganizationIdFromReadyAuthDomain,
} from "@/shared/lib/custom-domains";
import {
  browserBindingValueMatches,
  createGoogleLoginBrowserBinding,
  createGoogleLoginFlow,
  consumeGoogleLoginFlow,
  getGoogleLoginFlow,
  type GoogleLoginFlow,
} from "@/modules/auth/google-login-flow";
import {
  getActiveTenantGoogleOAuthConfig,
  startTenantGoogleOAuth,
  TENANT_GOOGLE_BROWSER_COOKIE,
} from "@/modules/auth/google-tenant/service";
import { applySharedRateLimit } from "@/shared/lib/ai-runtime-store";

const RELAY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function relayRequestMatchesExpectedOrigin(request: Request, expectedOrigin: string | null) {
  if (!expectedOrigin) return false;

  const origin = request.headers.get("origin");
  if (origin && origin !== "null") {
    try {
      return new URL(origin).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  // Some browsers serialize cross-origin form POSTs as Origin: null when the
  // relay document uses a no-referrer policy. The one-time flow and 256-bit
  // browser binding remain mandatory; Fetch Metadata additionally ensures this
  // fallback is only used for a top-level cross-site form navigation.
  return origin === "null"
    && request.headers.get("sec-fetch-site") === "cross-site"
    && request.headers.get("sec-fetch-mode") === "navigate"
    && request.headers.get("sec-fetch-dest") === "document";
}

function loginError(origin: string, message: string, organizationId?: string | null) {
  const destination = new URL("/auth/login", origin);
  destination.searchParams.set("error", message);
  if (organizationId) destination.searchParams.set("org", organizationId);
  return NextResponse.redirect(destination, { headers: RELAY_HEADERS });
}

function canonicalOrigin(request: Request) {
  return process.env.NODE_ENV === "production"
    ? new URL(getCanonicalAppUrl()).origin
    : getRequestOrigin(request);
}

function requestSource(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

async function hasActiveTenantGoogleConfig(organizationId: string | null) {
  if (!organizationId) return false;
  try {
    return Boolean(await getActiveTenantGoogleOAuthConfig(organizationId));
  } catch {
    // A tenant-specific integration must never take down the global fallback.
    return false;
  }
}

async function startTenantOAuth(params: {
  organizationId: string;
  origin: string;
  targetHost: string | null;
  billingTrack: "integracion" | "plataforma";
}) {
  const started = await startTenantGoogleOAuth({
    organizationId: params.organizationId,
    mode: "login",
    redirectUri: `${params.origin}/api/auth/google/tenant/callback`,
    targetHost: params.targetHost,
    billingTrack: params.billingTrack === "integracion" ? "integration" : "platform",
  });
  const response = NextResponse.redirect(started.url, { headers: RELAY_HEADERS });
  response.cookies.set(TENANT_GOOGLE_BROWSER_COOKIE, started.browserToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google/tenant/callback",
    maxAge: 10 * 60,
  });
  return response;
}

async function startCanonicalOAuth(params: {
  canonicalOrigin: string;
  organizationHint: string | null;
  billingTrack: "integracion" | "plataforma";
  initialFlow: GoogleLoginFlow | null;
}) {
  const oauthBinding = createGoogleLoginBrowserBinding("gb_google_oauth");
  const flowToken = await createGoogleLoginFlow({
    phase: "oauth_callback",
    targetHost: params.initialFlow?.targetHost ?? null,
    targetOrganizationId: params.initialFlow?.targetOrganizationId ?? null,
    organizationIdHint: params.initialFlow?.organizationIdHint ?? params.organizationHint,
    billingTrack: params.initialFlow?.billingTrack ?? (params.billingTrack === "integracion" ? "integration" : "platform"),
    browserBindingCookie: params.initialFlow?.browserBindingCookie ?? null,
    browserBindingHash: params.initialFlow?.browserBindingHash ?? null,
    oauthBindingCookie: oauthBinding.cookieName,
    oauthBindingHash: oauthBinding.hash,
  });
  if (!flowToken) {
    return loginError(params.canonicalOrigin, "Unable to validate secure sign-in. Please try again.", params.organizationHint);
  }

  const callbackUrl = new URL("/auth/callback", params.canonicalOrigin);
  callbackUrl.searchParams.set("google_flow", flowToken);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl.toString() },
  });
  if (error || !data.url) {
    return loginError(params.canonicalOrigin, "Unable to start sign-in with Google. Please try again.", params.organizationHint);
  }

  const response = params.initialFlow
    ? new NextResponse(
        `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Continue to Google</title></head><body><script>location.replace(${JSON.stringify(data.url).replaceAll("<", "\\u003c")});</script><noscript><a href="${data.url.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">Continue to Google</a></noscript></body></html>`,
        { status: 200, headers: { ...RELAY_HEADERS, "Content-Type": "text/html; charset=utf-8" } },
      )
    : NextResponse.redirect(data.url, { headers: RELAY_HEADERS });
  response.cookies.set(oauthBinding.cookieName, oauthBinding.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: 5 * 60,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationHint = normalizeOrganizationId(url.searchParams.get("org"));
  const billingTrack = url.searchParams.get("desde") === "integracion" ? "integracion" : "plataforma";
  const requestOrigin = getRequestOrigin(request);
  const appOrigin = canonicalOrigin(request);

  if (requestOrigin === appOrigin) {
    if (url.searchParams.has("flow")) {
      return loginError(appOrigin, "Secure custom-domain sign-in must use the protected browser relay.", organizationHint);
    }
    return startCanonicalOAuth({ canonicalOrigin: appOrigin, organizationHint, billingTrack, initialFlow: null });
  }

  const originHost = normalizeRequestHost(new URL(requestOrigin).hostname);
  const targetOrganizationId = await resolveOrganizationIdFromReadyAuthDomain(originHost);
  if (!originHost || !targetOrganizationId) {
    return loginError(appOrigin, "This custom domain is not ready for sign-in.");
  }

  if (await hasActiveTenantGoogleConfig(targetOrganizationId)) {
    try {
      const allowed = await applySharedRateLimit({
        userId: `tenant-google:${targetOrganizationId}:${requestSource(request)}`,
        windowMs: 5 * 60 * 1000,
        maxRequests: 10,
      });
      if (allowed) {
        return await startTenantOAuth({
          organizationId: targetOrganizationId,
          origin: requestOrigin,
          targetHost: originHost,
          billingTrack,
        });
      }
    } catch {
      // Preserve the established GetBackplate OAuth relay as the safe fallback.
    }
  }

  const browserBinding = createGoogleLoginBrowserBinding();
  const flowToken = await createGoogleLoginFlow({
    phase: "custom_handoff",
    targetHost: originHost,
    targetOrganizationId,
    organizationIdHint: targetOrganizationId,
    billingTrack: billingTrack === "integracion" ? "integration" : "platform",
    browserBindingCookie: browserBinding.cookieName,
    browserBindingHash: browserBinding.hash,
    oauthBindingCookie: null,
    oauthBindingHash: null,
  });
  if (!flowToken) {
    return loginError(appOrigin, "Unable to start secure sign-in. Please try again.", targetOrganizationId);
  }

  const relayUrl = new URL("/api/auth/google/start", appOrigin);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Starting secure sign-in</title></head><body><form id="relay" method="post" action="${relayUrl.toString()}"><input type="hidden" name="flow" value="${flowToken}"><input type="hidden" name="binding" value="${browserBinding.value}"></form><script>document.getElementById("relay").submit();</script><noscript><button type="submit" form="relay">Continue with Google</button></noscript></body></html>`;
  const response = new NextResponse(html, {
    status: 200,
    headers: { ...RELAY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
  response.cookies.set(browserBinding.cookieName, browserBinding.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/bridge",
    maxAge: 5 * 60,
  });
  return response;
}

export async function POST(request: Request) {
  const appOrigin = canonicalOrigin(request);
  if (getRequestOrigin(request) !== appOrigin) {
    return loginError(appOrigin, "Invalid secure sign-in relay.");
  }

  const form = await request.formData();
  const flowToken = String(form.get("flow") ?? "");
  const binding = String(form.get("binding") ?? "");
  const preview = /^[A-Za-z0-9_-]{43}$/.test(flowToken) ? await getGoogleLoginFlow(flowToken) : null;
  const requestOriginHeader = request.headers.get("origin");
  const expectedRelayOrigin = preview?.targetHost ? `https://${preview.targetHost}` : null;
  const relayOriginMatches = relayRequestMatchesExpectedOrigin(request, expectedRelayOrigin);
  const bindingMatches = browserBindingValueMatches(binding, preview?.browserBindingHash ?? null);
  if (
    !preview
    || preview.phase !== "custom_handoff"
    || preview.oauthBindingCookie !== null
    || preview.oauthBindingHash !== null
    || !bindingMatches
    || !relayOriginMatches
  ) {
    console.warn("[Google sign-in] Secure relay validation failed", {
      hasPreview: Boolean(preview),
      phase: preview?.phase ?? null,
      bindingMatches,
      originKind: requestOriginHeader === "null" ? "opaque" : (requestOriginHeader ? "explicit" : "missing"),
      relayOriginMatches,
    });
    return loginError(appOrigin, "Your secure sign-in relay expired or is invalid.");
  }

  const initialFlow = await consumeGoogleLoginFlow(flowToken);
  if (!initialFlow || initialFlow.phase !== "custom_handoff" || initialFlow.createdAt !== preview.createdAt) {
    return loginError(appOrigin, "Your secure sign-in relay was already used.");
  }

  return startCanonicalOAuth({
    canonicalOrigin: appOrigin,
    organizationHint: initialFlow.organizationIdHint,
    billingTrack: initialFlow.billingTrack === "integration" ? "integracion" : "plataforma",
    initialFlow,
  });
}
