import { NextResponse } from "next/server";

import { completeTenantGoogleOAuth, getTenantGoogleOAuthAttemptMode, TENANT_GOOGLE_BROWSER_COOKIE } from "@/modules/auth/google-tenant/service";
import { TenantGoogleOAuthError } from "@/modules/auth/google-tenant/client";
import { getRequestOrigin } from "@/shared/lib/app-url";

function clearBrowserCookie(response: NextResponse) {
  response.cookies.set(TENANT_GOOGLE_BROWSER_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google/tenant/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const browserToken = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${TENANT_GOOGLE_BROWSER_COOKIE}=`))
    ?.slice(TENANT_GOOGLE_BROWSER_COOKIE.length + 1) ?? "";
  const callbackUri = `${origin}/api/auth/google/tenant/callback`;
  const attemptMode = /^[A-Za-z0-9_-]{43}$/.test(state) && /^[A-Za-z0-9_-]{43}$/.test(browserToken)
    ? await getTenantGoogleOAuthAttemptMode({ state, browserToken: decodeURIComponent(browserToken), callbackUri })
    : null;
  if (!code || !/^[A-Za-z0-9_-]{43}$/.test(state) || !/^[A-Za-z0-9_-]{43}$/.test(browserToken)) {
    const destination = attemptMode === "test"
      ? `/app/settings?google_oauth=error&message=${encodeURIComponent("La prueba de Google venció o fue cancelada.")}`
      : `/auth/login?error=${encodeURIComponent("El acceso con Google venció o fue cancelado.")}`;
    return clearBrowserCookie(NextResponse.redirect(new URL(destination, origin)));
  }
  try {
    const result = await completeTenantGoogleOAuth({
      code,
      state,
      browserToken: decodeURIComponent(browserToken),
      callbackUri,
    });
    return clearBrowserCookie(NextResponse.redirect(new URL(result.redirectPath, origin)));
  } catch (caught) {
    const message = caught instanceof TenantGoogleOAuthError ? caught.message : "No se pudo completar el acceso con Google.";
    const destination = (caught instanceof TenantGoogleOAuthError && caught.mode === "test") || attemptMode === "test"
      ? `/app/settings?google_oauth=error&message=${encodeURIComponent(message)}`
      : `/auth/login?error=${encodeURIComponent(message)}`;
    return clearBrowserCookie(NextResponse.redirect(new URL(destination, origin)));
  }
}
