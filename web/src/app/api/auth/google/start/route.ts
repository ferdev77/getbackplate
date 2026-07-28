import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { getCanonicalAppUrl, getRequestOrigin } from "@/shared/lib/app-url";
import { normalizeOrganizationId } from "@/shared/lib/tenant-selection-shared";
import { normalizeRequestHost } from "@/shared/lib/custom-domains";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const organizationHint = normalizeOrganizationId(url.searchParams.get("org"));
  const billingTrack = url.searchParams.get("desde") === "integracion" ? "integracion" : "plataforma";
  const startHost = normalizeRequestHost(url.searchParams.get("start_host"));

  const requestOrigin = getRequestOrigin(request);
  const canonicalOrigin = process.env.NODE_ENV === "production"
    ? new URL(getCanonicalAppUrl()).origin
    : requestOrigin;

  // Google's redirect URI (Supabase's own /auth/v1/callback) and Supabase's
  // redirect_to allow-list both require exact, pre-registered URLs — they
  // can never accept an arbitrary customer's custom domain. So the entire
  // OAuth/PKCE round trip (this route's cookie, Supabase, Google) always
  // happens on the one permanent canonical domain. If sign-in was started
  // from a different host (a tenant custom domain), bounce there first so
  // the PKCE cookie this route sets is scoped to the domain that will
  // actually complete the exchange, carrying along which host to hand the
  // session back to once /auth/callback finishes (see the bridge in
  // /auth/callback and /auth/bridge).
  if (requestOrigin !== canonicalOrigin) {
    const bounceUrl = new URL("/api/auth/google/start", canonicalOrigin);
    if (organizationHint) bounceUrl.searchParams.set("org", organizationHint);
    bounceUrl.searchParams.set("desde", billingTrack);
    const originHost = normalizeRequestHost(new URL(requestOrigin).hostname);
    if (originHost) bounceUrl.searchParams.set("start_host", originHost);
    return NextResponse.redirect(bounceUrl);
  }

  const callbackUrl = new URL("/auth/callback", canonicalOrigin);
  if (organizationHint) callbackUrl.searchParams.set("org", organizationHint);
  callbackUrl.searchParams.set("desde", billingTrack);
  if (startHost) callbackUrl.searchParams.set("start_host", startHost);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  if (error || !data.url) {
    const loginError = new URL("/auth/login", canonicalOrigin);
    loginError.searchParams.set("error", "Unable to start sign-in with Google. Please try again.");
    if (organizationHint) loginError.searchParams.set("org", organizationHint);
    return NextResponse.redirect(loginError);
  }

  return NextResponse.redirect(data.url);
}
