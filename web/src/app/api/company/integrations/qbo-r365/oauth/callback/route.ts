import { NextResponse } from "next/server";
import { completeQboOAuthCallback } from "@/modules/integrations/qbo-r365/service";
import { verifyOAuthStateToken } from "@/modules/integrations/qbo-r365/oauth-state";

function buildRedirectUrl(requestUrl: string, status: "ok" | "error", message: string) {
  const url = new URL(requestUrl);
  url.pathname = "/app/integrations/quickbooks";
  url.search = "";
  url.searchParams.set("integration", "qbo-r365");
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return url;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const realmId = url.searchParams.get("realmId") ?? "";
  const state = url.searchParams.get("state") ?? "";

  if (!code || !realmId || !state) {
    return NextResponse.redirect(
      buildRedirectUrl(request.url, "error", "callback_incompleto"),
    );
  }

  try {
    const payload = verifyOAuthStateToken(state);
    await completeQboOAuthCallback({
      organizationId: payload.organizationId,
      actorId: payload.userId,
      code,
      realmId,
    });

    return NextResponse.redirect(buildRedirectUrl(request.url, "ok", "qbo_conectado"));
  } catch (error) {
    return NextResponse.redirect(
      buildRedirectUrl(
        request.url,
        "error",
        error instanceof Error ? error.message : "error_qbo_callback",
      ),
    );
  }
}
