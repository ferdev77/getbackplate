import { NextResponse } from "next/server";

import { startTenantGoogleOAuth, TENANT_GOOGLE_BROWSER_COOKIE } from "@/modules/auth/google-tenant/service";
import { TenantGoogleOAuthError } from "@/modules/auth/google-tenant/client";
import { assertCompanyAdminModuleApi, isModuleEnabledForOrganization } from "@/shared/lib/access";
import { getRequestOrigin } from "@/shared/lib/app-url";
import { resolveOrganizationIdFromReadyAuthDomain, normalizeRequestHost } from "@/shared/lib/custom-domains";
import { isSuperadminImpersonating } from "@/shared/lib/impersonation";

export async function GET(request: Request) {
  const access = await assertCompanyAdminModuleApi("settings");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  if (!await isModuleEnabledForOrganization(access.tenant.organizationId, "custom_branding")) {
    return NextResponse.json({ error: "Custom Branding debe estar activo." }, { status: 403 });
  }
  if (await isSuperadminImpersonating(access.userId, access.tenant.organizationId)) {
    return NextResponse.json({ error: "Operación bloqueada en modo impersonación." }, { status: 403 });
  }
  const origin = getRequestOrigin(request);
  const host = normalizeRequestHost(new URL(origin).hostname);
  const canonicalHost = normalizeRequestHost(new URL(process.env.NEXT_PUBLIC_APP_URL ?? origin).hostname);
  const hostOrganizationId = host && host !== canonicalHost ? await resolveOrganizationIdFromReadyAuthDomain(host) : null;
  if (!host || host === canonicalHost || hostOrganizationId !== access.tenant.organizationId) {
    return NextResponse.json({ error: "Este dominio no está listo para probar Google." }, { status: 403 });
  }
  try {
    const callbackUri = `${origin}/api/auth/google/tenant/callback`;
    const started = await startTenantGoogleOAuth({
      organizationId: access.tenant.organizationId,
      mode: "test",
      redirectUri: callbackUri,
      targetHost: host,
      targetUserId: access.userId,
      billingTrack: "platform",
    });
    const response = NextResponse.redirect(started.url);
    response.cookies.set(TENANT_GOOGLE_BROWSER_COOKIE, started.browserToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth/google/tenant/callback",
      maxAge: 10 * 60,
    });
    return response;
  } catch (caught) {
    const message = caught instanceof TenantGoogleOAuthError ? caught.message : "No se pudo iniciar la prueba con Google.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
