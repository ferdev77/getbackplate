import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import {
  consumeDomainBridgeToken,
  getDomainBridgeToken,
  type BridgePayload,
} from "@/modules/auth/domain-session-bridge";
import { getRequestOrigin } from "@/shared/lib/app-url";
import {
  normalizeRequestHost,
  resolveOrganizationIdFromReadyAuthDomain,
} from "@/shared/lib/custom-domains";
import { isSafeRedirectPath } from "@/shared/lib/safe-redirect-path";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";
import { browserBindingMatches } from "@/modules/auth/google-login-flow";

const SECURITY_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
};

function loginError(origin: string, message: string) {
  const destination = new URL("/auth/login", origin);
  destination.searchParams.set("error", message);
  return NextResponse.redirect(destination, { headers: SECURITY_HEADERS });
}

function requestHost(request: Request) {
  return normalizeRequestHost(new URL(getRequestOrigin(request)).hostname);
}

async function destinationMatches(request: Request, payload: BridgePayload) {
  const host = requestHost(request);
  if (!host || host !== payload.targetHost) return false;
  const organizationId = await resolveOrganizationIdFromReadyAuthDomain(host);
  return organizationId === payload.organizationId;
}

function browserMatches(request: Request, payload: BridgePayload) {
  return browserBindingMatches(
    request.headers.get("cookie"),
    payload.browserBindingCookie,
    payload.browserBindingHash,
  );
}

async function hasActiveMembership(payload: BridgePayload) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("memberships")
    .select("id")
    .eq("organization_id", payload.organizationId)
    .eq("user_id", payload.userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return loginError(requestUrl.origin, "Your sign-in link is incomplete.");
  }

  const payload = await getDomainBridgeToken(token);
  if (!payload || !(await destinationMatches(request, payload)) || !browserMatches(request, payload)) {
    return loginError(requestUrl.origin, "This sign-in link is not valid for this domain.");
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Completing sign-in</title></head><body><form id="bridge" method="post" action="/auth/bridge"><input type="hidden" name="token" value="${token}"></form><script>history.replaceState(null,"","/auth/bridge");document.getElementById("bridge").submit();</script><noscript><button type="submit" form="bridge">Complete sign-in</button></noscript></body></html>`;
  return new Response(html, {
    status: 200,
    headers: { ...SECURITY_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const requestOrigin = getRequestOrigin(request);
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return loginError(requestOrigin, "Your sign-in link is incomplete.");
  }

  const preview = await getDomainBridgeToken(token);
  if (
    !preview
    || !(await destinationMatches(request, preview))
    || !browserMatches(request, preview)
    || !(await hasActiveMembership(preview))
  ) {
    return loginError(requestOrigin, "This sign-in link is not valid for this account or domain.");
  }

  const payload = await consumeDomainBridgeToken(token);
  if (
    !payload
    || payload.targetHost !== preview.targetHost
    || payload.organizationId !== preview.organizationId
    || payload.userId !== preview.userId
  ) {
    return loginError(requestOrigin, "Your sign-in link has expired or was already used.");
  }

  if (
    !(await destinationMatches(request, payload))
    || !browserMatches(request, payload)
    || !(await hasActiveMembership(payload))
  ) {
    return loginError(requestOrigin, "Your account or domain access changed during sign-in.");
  }

  await clearMfaVerifiedCookie();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });
  if (error) {
    return loginError(requestOrigin, "Your sign-in session could not be established here. Please try again.");
  }

  const { data: userData } = await supabase.auth.getUser();
  if (userData.user?.id !== payload.userId || !(await hasActiveMembership(payload))) {
    await supabase.auth.signOut();
    return loginError(requestOrigin, "Your account no longer has access to this domain.");
  }

  const next = isSafeRedirectPath(payload.next) ? payload.next : "/";
  const response = NextResponse.redirect(new URL(next, requestOrigin), { headers: SECURITY_HEADERS });
  response.cookies.set(payload.browserBindingCookie, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/auth/bridge",
    maxAge: 0,
  });
  return response;
}
