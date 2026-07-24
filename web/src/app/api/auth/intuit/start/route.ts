import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { INTUIT_BROWSER_COOKIE, IntuitSsoError, startIntuitSso } from "@/modules/auth/intuit-sso/service";
import { getCanonicalAppUrl, getRequestOrigin } from "@/shared/lib/app-url";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestOrigin = getRequestOrigin(request);
  const returnTo = url.searchParams.get("returnTo");
  const mode = url.searchParams.get("mode") === "link" ? "link" : "login";

  try {
    const canonicalOrigin = new URL(getCanonicalAppUrl()).origin;
    if (process.env.NODE_ENV === "production" && url.origin !== canonicalOrigin) {
      return NextResponse.redirect(new URL(`${url.pathname}${url.search}`, canonicalOrigin));
    }
    const cookieStore = await cookies();
    const existingBrowserToken = cookieStore.get(INTUIT_BROWSER_COOKIE)?.value;
    const browserToken = existingBrowserToken || randomBytes(32).toString("base64url");
    let targetUserId: string | null = null;
    if (mode === "link") {
      const supabase = await createSupabaseServerClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        return NextResponse.redirect(new URL("/auth/login?error=Sign+in+before+linking+Intuit.", requestOrigin));
      }
      const lastSignInAt = data.user.last_sign_in_at ? new Date(data.user.last_sign_in_at).getTime() : 0;
      if (!lastSignInAt || Date.now() - lastSignInAt > 10 * 60 * 1000) {
        return NextResponse.redirect(new URL(
          "/auth/login?error=" + encodeURIComponent("Sign in again before linking a new login method."),
          requestOrigin,
        ));
      }
      targetUserId = data.user.id;
    }
    const authorizeUrl = await startIntuitSso({ mode, browserToken, returnTo, targetUserId });
    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(INTUIT_BROWSER_COOKIE, browserToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    console.error("[intuit-sso] start failed", error instanceof IntuitSsoError ? error.code : "unexpected");
    const response = NextResponse.redirect(
      new URL(
        "/auth/login?error=" + encodeURIComponent("Unable to start Sign in with Intuit. Please try again."),
        requestOrigin,
      ),
    );
    response.headers.set("Cache-Control", "no-store, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
}
