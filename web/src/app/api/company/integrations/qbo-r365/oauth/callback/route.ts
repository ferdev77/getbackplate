import { NextResponse } from "next/server";
import {
  assertQboOAuthAttemptAuthorized,
  completeQboOAuthCallback,
  consumeQboOAuthAttempt,
  finishQboOAuthAttempt,
  QboRealmOwnershipError,
} from "@/modules/integrations/qbo-r365/service";
import { verifyOAuthStateToken } from "@/modules/integrations/qbo-r365/oauth-state";
import { getCanonicalAppUrl } from "@/shared/lib/app-url";

function buildRedirectUrl(status: "ok" | "error", message: string, origin = getCanonicalAppUrl()) {
  const url = new URL("/app/integrations/quickbooks", origin);
  url.searchParams.set("integration", "qbo-r365");
  url.searchParams.set("status", status);
  url.searchParams.set("message", message);
  return url;
}

function redirectToIntegration(status: "ok" | "error", message: string, origin?: string) {
  const response = NextResponse.redirect(buildRedirectUrl(status, message, origin));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function oauthFailureCode(error: unknown) {
  if (error instanceof QboRealmOwnershipError) return "realm_owned";
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return `db_${error.code}`.slice(0, 100);
  }
  const message = error instanceof Error ? error.message : "";
  if (/changed while it was being connected/i.test(message)) return "connection_changed";
  if (/currently being disconnected/i.test(message)) return "disconnect_pending";
  if (/encryption key/i.test(message)) return "encryption_config";
  if (/authorization is no longer valid/i.test(message)) return "authorization_stale";
  return "callback_failed";
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

  let attempt: { id: string; returnOrigin: string } | null = null;
  try {
    const payload = verifyOAuthStateToken(state);
    attempt = await consumeQboOAuthAttempt({
      state,
      organizationId: payload.organizationId,
      userId: payload.userId,
    });
    await assertQboOAuthAttemptAuthorized({
      organizationId: payload.organizationId,
      userId: payload.userId,
    });

    await completeQboOAuthCallback({
      organizationId: payload.organizationId,
      actorId: payload.userId,
      code,
      realmId,
    });
    await finishQboOAuthAttempt(attempt.id, "completed");

    return redirectToIntegration("ok", "QuickBooks® Online connected successfully.", attempt.returnOrigin);
  } catch (error) {
    const failureCode = oauthFailureCode(error);
    console.error(
      "[qbo-oauth] callback failed",
      failureCode,
      error instanceof Error ? error.message : "unknown_error",
    );
    if (attempt) await finishQboOAuthAttempt(attempt.id, "failed", failureCode);
    if (error instanceof QboRealmOwnershipError) {
      return redirectToIntegration("error", error.message, attempt?.returnOrigin);
    }
    return redirectToIntegration("error", "Unable to complete QuickBooks® Online authorization. Please try again.", attempt?.returnOrigin);
  }
}
