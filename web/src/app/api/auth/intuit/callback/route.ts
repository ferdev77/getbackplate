import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { cancelIntuitSso, completeIntuitSso, INTUIT_BROWSER_COOKIE, IntuitSsoError } from "@/modules/auth/intuit-sso/service";
import { getCanonicalAppUrl, getRequestOrigin } from "@/shared/lib/app-url";

function loginError(origin: string, message: string) {
  return callbackRedirect(new URL("/auth/login?desde=integracion&error=" + encodeURIComponent(message), origin));
}

function callbackRedirect(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");
  const origin = process.env.NODE_ENV === "production"
    ? new URL(getCanonicalAppUrl()).origin
    : getRequestOrigin(request);

  if (oauthError === "access_denied") {
    const cookieStore = await cookies();
    const browserToken = cookieStore.get(INTUIT_BROWSER_COOKIE)?.value ?? "";
    if (state && browserToken) await cancelIntuitSso({ state, browserToken });
    return loginError(origin, "Sign in with Intuit was canceled.");
  }

  if (!code || !state) {
    return loginError(origin, "The Intuit sign-in callback is incomplete.");
  }

  try {
    const cookieStore = await cookies();
    const browserToken = cookieStore.get(INTUIT_BROWSER_COOKIE)?.value ?? "";
    if (!browserToken) return loginError(origin, "This Intuit sign-in request must be restarted in the same browser.");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const { redirectPath } = await completeIntuitSso({
      code,
      state,
      browserToken,
      authenticatedUserId: data.user?.id ?? null,
    });
    return callbackRedirect(new URL(redirectPath, origin));
  } catch (error) {
    console.error("[intuit-sso] callback failed", error instanceof IntuitSsoError ? error.code : "unexpected");
    return loginError(
      origin,
      error instanceof IntuitSsoError ? error.message : "Unable to complete Sign in with Intuit. Please try again.",
    );
  }
}
