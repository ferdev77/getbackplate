import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { cancelIntuitSso, completeIntuitSso, INTUIT_BROWSER_COOKIE, IntuitSsoError } from "@/modules/auth/intuit-sso/service";

function loginError(origin: string, message: string) {
  return NextResponse.redirect(new URL("/auth/login?desde=integracion&error=" + encodeURIComponent(message), origin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");

  if (oauthError === "access_denied") {
    const cookieStore = await cookies();
    const browserToken = cookieStore.get(INTUIT_BROWSER_COOKIE)?.value ?? "";
    if (state && browserToken) await cancelIntuitSso({ state, browserToken });
    return loginError(url.origin, "Sign in with Intuit was canceled.");
  }

  if (!code || !state) {
    return loginError(url.origin, "The Intuit sign-in callback is incomplete.");
  }

  try {
    const cookieStore = await cookies();
    const browserToken = cookieStore.get(INTUIT_BROWSER_COOKIE)?.value ?? "";
    if (!browserToken) return loginError(url.origin, "This Intuit sign-in request must be restarted in the same browser.");
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    const { redirectPath } = await completeIntuitSso({
      code,
      state,
      browserToken,
      authenticatedUserId: data.user?.id ?? null,
    });
    const response = NextResponse.redirect(new URL(redirectPath, url.origin));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.error("[intuit-sso] callback failed", error instanceof IntuitSsoError ? error.code : "unexpected");
    return loginError(
      url.origin,
      error instanceof IntuitSsoError ? error.message : "Unable to complete Sign in with Intuit. Please try again.",
    );
  }
}
