import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent, logAuthEvent } from "@/shared/lib/audit";
import { AUDIT_REASON_CODES } from "@/shared/lib/audit-taxonomy";
import { resolveOrganizationIdFromAuthHint } from "@/shared/lib/tenant-auth-branding";
import { resolveOrganizationIdFromActiveDomain, normalizeRequestHost } from "@/shared/lib/custom-domains";
import { resolvePostLoginRedirect, PostLoginRoutingError } from "@/modules/auth/post-login-routing";
import { createDomainBridgeToken } from "@/modules/auth/domain-session-bridge";
import { isSafeRedirectPath } from "@/shared/lib/safe-redirect-path";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const token = requestUrl.searchParams.get("token");
  const email = requestUrl.searchParams.get("email");
  const type = requestUrl.searchParams.get("type");
  const org = requestUrl.searchParams.get("org");
  const oauthError = requestUrl.searchParams.get("error");
  const rawNext = requestUrl.searchParams.get("next");
  const startHost = normalizeRequestHost(requestUrl.searchParams.get("start_host"));
  const billingTrack = requestUrl.searchParams.get("desde") === "integracion" ? "integration" : "platform";
  // Set explicitly by /api/auth/google/start. Deliberately not inferred
  // from "no `next` param present" — a misconfigured Supabase redirect_to
  // allow-list (falls back to the project's Site URL) or the safety-net
  // redirect below in proxy.ts can both inject a `next` before this request
  // ever reaches here, which would otherwise hide a real Google sign-in.
  const isOAuthSignIn = requestUrl.searchParams.get("auth_provider") === "google";

  const supabase = await createSupabaseServerClient();

  if (oauthError) {
    await logAuthEvent({
      action: "login.failed",
      outcome: "denied",
      severity: "low",
      reasonCode: AUDIT_REASON_CODES.INVALID_CREDENTIALS,
      metadata: { provider: "google", oauth_error: oauthError },
    });
    const cancelUrl = new URL("/auth/login", requestUrl.origin);
    cancelUrl.searchParams.set("error", "Sign in with Google was canceled.");
    if (org) cancelUrl.searchParams.set("org", org);
    return NextResponse.redirect(cancelUrl);
  }

  let authErrorMessage: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authErrorMessage = error?.message ?? null;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "recovery" | "invite" | "email",
    });
    authErrorMessage = error?.message ?? null;
  } else if (token && (type === "recovery" || type === "email")) {
    const { error } = await supabase.auth.verifyOtp({
      token,
      email: email ?? "",
      type,
    });
    authErrorMessage = error?.message ?? null;
  }

  if (authErrorMessage) {
    if (isOAuthSignIn) {
      const failedUrl = new URL("/auth/login", requestUrl.origin);
      failedUrl.searchParams.set("error", "Your Google session could not be validated. Please try again.");
      if (org) failedUrl.searchParams.set("org", org);
      return NextResponse.redirect(failedUrl);
    }

    const redirectOnError = new URL("/auth/forgot-password", requestUrl.origin);
    redirectOnError.searchParams.set(
      "error",
      "The password recovery link has expired or is invalid. Request a new one.",
    );
    if (org) {
      redirectOnError.searchParams.set("org", org);
    }

    return NextResponse.redirect(redirectOnError);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (org) {
    if (user?.email) {
      const admin = createSupabaseAdminClient();
      const { data: invitation } = await admin
        .from("organization_invitations")
        .select("id, organization_id, email, first_login_completed_at")
        .eq("organization_id", org)
        .eq("source", "superadmin")
        .eq("role_code", "company_admin")
        .contains("metadata", { mode: "superadmin_invite" })
        .ilike("email", user.email)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (invitation && !invitation.first_login_completed_at) {
        const firstLoginAt = new Date().toISOString();
        const { error: markError } = await admin
          .from("organization_invitations")
          .update({
            first_login_completed_at: firstLoginAt,
            first_login_user_id: user.id,
          })
          .eq("id", invitation.id)
          .is("first_login_completed_at", null);

        if (!markError) {
          await logAuditEvent({
            action: "organization.invited_admin.first_login",
            entityType: "organization_invitation",
            entityId: invitation.id,
            organizationId: invitation.organization_id,
            eventDomain: "superadmin",
            outcome: "success",
            severity: "medium",
            metadata: {
              invited_email: invitation.email,
              first_login_user_id: user.id,
              first_login_completed_at: firstLoginAt,
            },
          });
        }
      }
    }
  }

  let next = isSafeRedirectPath(rawNext) ? rawNext : type === "recovery" ? "/auth/change-password?reason=recovery" : "/";

  if (isOAuthSignIn && user) {
    const organizationIdHint = await resolveOrganizationIdFromAuthHint(org);
    const companyDashboardPath = `/app/dashboard?billingTrack=${billingTrack}`;

    try {
      next = await resolvePostLoginRedirect({
        userId: user.id,
        email: user.email ?? null,
        organizationIdHint,
        companyDashboardPath,
        provider: "google",
      });
    } catch (routingError) {
      if (routingError instanceof PostLoginRoutingError) {
        await supabase.auth.signOut();
        const deniedUrl = new URL("/auth/login", requestUrl.origin);
        deniedUrl.searchParams.set("error", routingError.message);
        if (org) deniedUrl.searchParams.set("org", org);
        return NextResponse.redirect(deniedUrl);
      }
      throw routingError;
    }

    // Google/Supabase only ever redirect back to this one canonical domain
    // (see /api/auth/google/start). If sign-in actually started on a
    // tenant's own custom domain, hand the session there now via a
    // short-lived bridge token instead of leaving the user authenticated on
    // the wrong host — this is what lets a brand new customer domain work
    // without registering it anywhere in Google or Supabase.
    if (startHost && startHost !== requestUrl.hostname) {
      const bridgeOrganizationId = await resolveOrganizationIdFromActiveDomain(startHost);
      if (bridgeOrganizationId) {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        const bridgeToken = session
          ? await createDomainBridgeToken({
              accessToken: session.access_token,
              refreshToken: session.refresh_token,
              next,
            })
          : null;

        if (bridgeToken) {
          // scope: "local" only clears this domain's cookie — the default
          // ("global") revokes the refresh token server-side, which would
          // invalidate the very token just handed to the bridge before the
          // target domain ever gets to use it.
          await supabase.auth.signOut({ scope: "local" });
          revalidatePath("/", "layout");
          return NextResponse.redirect(`https://${startHost}/auth/bridge?token=${bridgeToken}`);
        }
      }
    }
  }

  const redirectUrl = new URL(next, requestUrl.origin);
  if (org && !redirectUrl.searchParams.has("org") && redirectUrl.pathname.startsWith("/app/")) {
    redirectUrl.searchParams.set("org", org);
  }

  revalidatePath("/", "layout");

  return NextResponse.redirect(redirectUrl);
}
