import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { consumeDomainBridgeToken } from "@/modules/auth/domain-session-bridge";
import { isSafeRedirectPath } from "@/shared/lib/safe-redirect-path";

function loginError(origin: string, message: string) {
  const destination = new URL("/auth/login", origin);
  destination.searchParams.set("error", message);
  return NextResponse.redirect(destination);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return loginError(requestUrl.origin, "Your sign-in link is incomplete.");
  }

  const payload = await consumeDomainBridgeToken(token);
  if (!payload) {
    return loginError(requestUrl.origin, "Your sign-in link has expired. Please try again.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.setSession({
    access_token: payload.accessToken,
    refresh_token: payload.refreshToken,
  });

  if (error) {
    return loginError(requestUrl.origin, "Your sign-in session could not be established here. Please try again.");
  }

  const next = isSafeRedirectPath(payload.next) ? payload.next : "/";
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
