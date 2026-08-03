import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { logAuditEvent, logAuthEvent } from "@/shared/lib/audit";
import { AUDIT_REASON_CODES } from "@/shared/lib/audit-taxonomy";
import { resolveOrganizationIdFromAuthHint } from "@/shared/lib/tenant-auth-branding";
import { resolveOrganizationIdFromReadyAuthDomain } from "@/shared/lib/custom-domains";
import { resolvePostLoginRedirect, PostLoginRoutingError } from "@/modules/auth/post-login-routing";
import { createDomainBridgeToken } from "@/modules/auth/domain-session-bridge";
import {
  browserBindingMatches,
  consumeGoogleLoginFlow,
  getGoogleLoginFlow,
  type GoogleLoginFlow,
} from "@/modules/auth/google-login-flow";
import { isSafeRedirectPath } from "@/shared/lib/safe-redirect-path";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";

function clearOAuthBindingCookie(response: NextResponse, flow: GoogleLoginFlow) {
  if (flow.oauthBindingCookie && /^[a-z0-9_]{1,64}$/.test(flow.oauthBindingCookie)) {
    response.cookies.set(flow.oauthBindingCookie, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: 0,
    });
  }
  return response;
}

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
  const googleFlowToken = requestUrl.searchParams.get("google_flow");

  const supabase = await createSupabaseServerClient();
  const googleFlowPreview = googleFlowToken ? await getGoogleLoginFlow(googleFlowToken) : null;
  const validOAuthBrowser = googleFlowPreview
    ? browserBindingMatches(
        request.headers.get("cookie"),
        googleFlowPreview.oauthBindingCookie,
        googleFlowPreview.oauthBindingHash,
      )
    : false;

  if (googleFlowToken && (!googleFlowPreview || !validOAuthBrowser)) {
    return NextResponse.redirect(new URL("/auth/login?error=This secure sign-in request belongs to another browser or expired.", requestUrl.origin));
  }

  if (googleFlowPreview && googleFlowPreview.phase !== "oauth_callback") {
    return NextResponse.redirect(new URL("/auth/login?error=Invalid secure sign-in stage.", requestUrl.origin));
  }

  if (oauthError) {
    const canceledFlow = googleFlowToken && validOAuthBrowser ? await consumeGoogleLoginFlow(googleFlowToken) : null;
    await logAuthEvent({
      action: "login.failed",
      outcome: "denied",
      severity: "low",
      reasonCode: AUDIT_REASON_CODES.INVALID_CREDENTIALS,
      metadata: { provider: "google", oauth_error: oauthError, secure_flow: Boolean(canceledFlow) },
    });
    const cancelUrl = new URL("/auth/login", requestUrl.origin);
    cancelUrl.searchParams.set("error", "Sign in with Google was canceled.");
    if (canceledFlow?.organizationIdHint) cancelUrl.searchParams.set("org", canceledFlow.organizationIdHint);
    else if (org) cancelUrl.searchParams.set("org", org);
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
    if (googleFlowToken) {
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

  let googleFlow: GoogleLoginFlow | null = null;
  if (googleFlowToken) {
    if (!code) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/auth/login?error=Invalid secure sign-in callback.", requestUrl.origin));
    }
    googleFlow = await consumeGoogleLoginFlow(googleFlowToken);
    if (
      !googleFlow
      || googleFlow.phase !== "oauth_callback"
      || googleFlow.oauthBindingCookie !== googleFlowPreview?.oauthBindingCookie
      || googleFlow.oauthBindingHash !== googleFlowPreview?.oauthBindingHash
      || googleFlow.targetHost !== googleFlowPreview?.targetHost
      || googleFlow.targetOrganizationId !== googleFlowPreview?.targetOrganizationId
    ) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/auth/login?error=Your secure sign-in request expired or was already used.", requestUrl.origin));
    }
    await clearMfaVerifiedCookie();
  }

  const organizationAuthHint = googleFlow?.organizationIdHint ?? org;
  const billingTrack = googleFlow?.billingTrack ?? "platform";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (googleFlow && !user) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/auth/login?error=Your Google account could not be validated.", requestUrl.origin));
  }

  if (organizationAuthHint) {
    if (user?.email) {
      const admin = createSupabaseAdminClient();
      const { data: invitation } = await admin
        .from("organization_invitations")
        .select("id, organization_id, email, first_login_completed_at")
        .eq("organization_id", organizationAuthHint)
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

  if (googleFlow && user) {
    const organizationIdHint = await resolveOrganizationIdFromAuthHint(organizationAuthHint);
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
        if (organizationAuthHint) deniedUrl.searchParams.set("org", organizationAuthHint);
        return NextResponse.redirect(deniedUrl);
      }
      await supabase.auth.signOut();
      await logAuthEvent({
        action: "login.failed",
        outcome: "error",
        severity: "medium",
        reasonCode: AUDIT_REASON_CODES.UNEXPECTED_LOGIN_EXCEPTION,
        metadata: { provider: "google", stage: "post_login_routing" },
      });
      const failedUrl = new URL("/auth/login", requestUrl.origin);
      failedUrl.searchParams.set("error", "Your account could not be routed safely. Please try again.");
      return clearOAuthBindingCookie(NextResponse.redirect(failedUrl), googleFlow);
    }

    // Google/Supabase only ever redirect back to this one canonical domain
    // (see /api/auth/google/start). If sign-in actually started on a
    // tenant's own custom domain, hand the session there now via a
    // short-lived bridge token instead of leaving the user authenticated on
    // the wrong host — this is what lets a brand new customer domain work
    // without registering it anywhere in Google or Supabase.
    if (googleFlow.targetHost && googleFlow.targetOrganizationId) {
      let bridgeOrganizationId: string | null;
      try {
        bridgeOrganizationId = await resolveOrganizationIdFromReadyAuthDomain(googleFlow.targetHost);
      } catch {
        await supabase.auth.signOut();
        const failedUrl = new URL("/auth/login", requestUrl.origin);
        failedUrl.searchParams.set("error", "The custom domain could not be validated. Please try again.");
        return clearOAuthBindingCookie(NextResponse.redirect(failedUrl), googleFlow);
      }
      const admin = createSupabaseAdminClient();
      const { data: membership } = await admin
        .from("memberships")
        .select("id")
        .eq("organization_id", googleFlow.targetOrganizationId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (
        bridgeOrganizationId === googleFlow.targetOrganizationId
        && membership
        && googleFlow.browserBindingCookie
        && googleFlow.browserBindingHash
        && (next.startsWith("/app/") || next.startsWith("/portal/") || next.startsWith("/auth/verify-mfa"))
      ) {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        const bridgeToken = session
          ? await createDomainBridgeToken({
               accessToken: session.access_token,
               refreshToken: session.refresh_token,
               next,
               targetHost: googleFlow.targetHost,
               organizationId: googleFlow.targetOrganizationId,
               userId: user.id,
               browserBindingCookie: googleFlow.browserBindingCookie,
               browserBindingHash: googleFlow.browserBindingHash,
            })
          : null;

        if (bridgeToken) {
          // Deliberately not signing out here: Supabase revokes the current
          // session's refresh token server-side on signOut regardless of
          // scope ("local" vs "global" only changes whether OTHER sessions
          // are also revoked) — that would invalidate the very token just
          // handed to the bridge before the target domain gets to use it.
          // Leaving the cookie on the canonical domain is harmless; it's
          // the same authenticated user.
          revalidatePath("/", "layout");
          return clearOAuthBindingCookie(
            NextResponse.redirect(`https://${googleFlow.targetHost}/auth/bridge?token=${bridgeToken}`),
            googleFlow,
          );
        }
      }

      await supabase.auth.signOut();
      const deniedUrl = new URL("/auth/login", requestUrl.origin);
      deniedUrl.searchParams.set("error", "Your account does not have access to this custom domain.");
      if (organizationAuthHint) deniedUrl.searchParams.set("org", organizationAuthHint);
      return clearOAuthBindingCookie(NextResponse.redirect(deniedUrl), googleFlow);
    }
  }

  const redirectUrl = new URL(next, requestUrl.origin);
  if (organizationAuthHint && !redirectUrl.searchParams.has("org") && redirectUrl.pathname.startsWith("/app/")) {
    redirectUrl.searchParams.set("org", organizationAuthHint);
  }

  revalidatePath("/", "layout");

  const response = NextResponse.redirect(redirectUrl);
  return googleFlow ? clearOAuthBindingCookie(response, googleFlow) : response;
}
