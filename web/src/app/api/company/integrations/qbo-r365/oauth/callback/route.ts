import { NextResponse } from "next/server";
import { completeQboOAuthCallback } from "@/modules/integrations/qbo-r365/service";
import { verifyOAuthStateToken } from "@/modules/integrations/qbo-r365/oauth-state";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import { getCanonicalAppUrl } from "@/shared/lib/app-url";

function buildRedirectUrl(status: "ok" | "error", message: string) {
  const url = new URL("/app/integrations/quickbooks", getCanonicalAppUrl());
  url.searchParams.set("integration", "qbo-r365");
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return url;
}

function redirectToIntegration(status: "ok" | "error", message: string) {
  const response = NextResponse.redirect(buildRedirectUrl(status, message));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const realmId = url.searchParams.get("realmId") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const oauthError = url.searchParams.get("error");

  if (oauthError === "access_denied") {
    return redirectToIntegration("error", "QuickBooks® Online authorization was canceled.");
  }

  if (!code || !realmId || !state) {
    return redirectToIntegration("error", "The QuickBooks® Online callback is incomplete.");
  }

  try {
    const payload = verifyOAuthStateToken(state);
    const access = await assertCompanyAdminModuleApi("settings");
    if (
      !access.ok ||
      access.userId !== payload.userId ||
      access.tenant.organizationId !== payload.organizationId
    ) {
      throw new Error("OAuth authorization is no longer valid.");
    }

    await completeQboOAuthCallback({
      organizationId: payload.organizationId,
      actorId: payload.userId,
      code,
      realmId,
    });

    return redirectToIntegration("ok", "QuickBooks® Online connected successfully.");
  } catch {
    return redirectToIntegration("error", "Unable to complete QuickBooks® Online authorization. Please try again.");
  }
}
