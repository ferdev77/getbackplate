import { createHash, randomBytes } from "crypto";
import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";
import { logAuditEvent } from "@/shared/lib/audit";
import {
  buildIntuitIdentityAuthorizeUrl,
  exchangeIntuitIdentityCode,
  fetchIntuitIdentity,
  verifyIntuitIdToken,
} from "./client";

export const INTUIT_BROWSER_COOKIE = "gb_intuit_browser";

type AttemptMode = "login" | "link";

export class IntuitSsoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function validateIntuitNonceClaim(nonce: string | null, expectedHash: string) {
  if (nonce === null) return "omitted" as const;
  if (hash(nonce) === expectedHash) return "matched" as const;
  throw new IntuitSsoError("nonce_mismatch", "Intuit identity nonce does not match.");
}

function getConfig() {
  const clientId = process.env.QBO_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.QBO_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = process.env.INTUIT_SSO_REDIRECT_URI?.trim() ?? "";
  const environment: "sandbox" | "production" = process.env.INTUIT_ENVIRONMENT === "sandbox" ? "sandbox" : "production";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new IntuitSsoError("not_configured", "Sign in with Intuit is not configured.");
  }
  return { clientId, clientSecret, redirectUri, environment };
}

export function safeIntuitReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return "/app/dashboard";
  }
  if (value.startsWith("/api/auth/intuit") || value.startsWith("/auth/callback")) {
    return "/app/dashboard";
  }
  return value;
}

export async function startIntuitSso(input: {
  mode: AttemptMode;
  browserToken: string;
  returnTo?: string | null;
  targetUserId?: string | null;
}) {
  const config = getConfig();
  const admin = createSupabaseAdminClient();
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");

  await admin.from("external_auth_attempts").delete().lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("external_auth_attempts").insert({
    provider: "intuit",
    mode: input.mode,
    state_hash: hash(state),
    browser_hash: hash(input.browserToken),
    nonce_hash: hash(nonce),
    return_to: safeIntuitReturnPath(input.returnTo),
    target_user_id: input.targetUserId ?? null,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw new IntuitSsoError("attempt_create_failed", error.message);

  return buildIntuitIdentityAuthorizeUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    state,
    nonce,
  });
}

async function createLocalSession(userId: string, email: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new IntuitSsoError("session_failed", "Unable to create a local session.");

  const server = await createSupabaseServerClient();
  await clearMfaVerifiedCookie();
  const { data: verified, error: verifyError } = await server.auth.verifyOtp({
    token_hash: tokenHash,
    type: "magiclink",
  });
  if (verifyError || verified.user?.id !== userId) {
    throw new IntuitSsoError("session_failed", "Unable to verify the local session.");
  }
}

async function resolveRedirect(userId: string, fallback: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("memberships")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) throw new IntuitSsoError("membership_lookup_failed", "Unable to resolve your organization.");
  const organizations = [...new Set((data ?? []).map((row) => String(row.organization_id)))];
  if (organizations.length === 0) return "/auth/intuit/complete";
  if (organizations.length > 1) return "/auth/select-organization";
  return fallback === "/app/dashboard"
    ? `/app/dashboard?org=${encodeURIComponent(organizations[0])}`
    : fallback;
}

function registrationCompletionPath(returnTo: string) {
  if (returnTo.startsWith("/auth/intuit/complete")) return returnTo;
  const parsed = new URL(returnTo, "https://app.getbackplate.com");
  const billingTrack = parsed.searchParams.get("billingTrack");
  return billingTrack === "integration" || billingTrack === "platform"
    ? `/auth/intuit/complete?billingTrack=${billingTrack}`
    : "/auth/intuit/complete";
}

export async function completeIntuitSso(input: {
  code: string;
  state: string;
  browserToken: string;
  authenticatedUserId?: string | null;
}) {
  const config = getConfig();
  const admin = createSupabaseAdminClient();
  let matchedExistingUserId: string | null = null;
  const { data: attempts, error: consumeError } = await admin.rpc("consume_external_auth_attempt", {
    p_provider: "intuit",
    p_state_hash: hash(input.state),
    p_browser_hash: hash(input.browserToken),
  });
  const attempt = attempts?.[0] as {
    id: string;
    mode: AttemptMode;
    nonce_hash: string;
    return_to: string;
    target_user_id: string | null;
  } | undefined;
  if (consumeError || !attempt) {
    throw new IntuitSsoError("invalid_state", "This Intuit sign-in request is invalid or expired.");
  }

  try {
    const token = await exchangeIntuitIdentityCode({ ...config, code: input.code });
    const identityToken = await verifyIntuitIdToken({
      idToken: token.idToken,
      clientId: config.clientId,
    });
    const nonceClaim = validateIntuitNonceClaim(identityToken.nonce, attempt.nonce_hash);
    const userInfo = await fetchIntuitIdentity(token.accessToken, config.environment);
    const email = userInfo.email?.trim().toLowerCase();
    if (userInfo.sub !== identityToken.subject || !email || userInfo.emailVerified !== true) {
      throw new IntuitSsoError("identity_mismatch", "Intuit did not return a matching verified identity.");
    }
    const profile = {
      givenName: userInfo.givenName ?? null,
      familyName: userInfo.familyName ?? null,
      phoneNumber: userInfo.phoneNumber ?? null,
      phoneNumberVerified: userInfo.phoneNumberVerified ?? false,
      address: userInfo.address ?? null,
    };

    if (attempt.mode === "link") {
      if (!attempt.target_user_id || input.authenticatedUserId !== attempt.target_user_id) {
        throw new IntuitSsoError("link_session_mismatch", "Sign in again before linking Intuit.");
      }
      const { error } = await admin.from("external_auth_identities").insert({
        provider: "intuit",
        issuer: identityToken.issuer,
        subject: identityToken.subject,
        user_id: attempt.target_user_id,
        email_at_link: email,
        email_verified_at: new Date().toISOString(),
        profile,
        last_login_at: new Date().toISOString(),
      });
      if (error) throw new IntuitSsoError("identity_already_linked", "This Intuit account is already linked.");
      await admin.from("external_auth_attempts").update({ status: "completed" }).eq("id", attempt.id);
      await logAuditEvent({
        action: "auth.identity.linked",
        entityType: "external_auth_identity",
        actorId: attempt.target_user_id,
        eventDomain: "auth",
        outcome: "success",
        metadata: { provider: "intuit", nonce_claim: nonceClaim },
      });
      return { redirectPath: attempt.return_to, linked: true };
    }

    const { data: linkedIdentity } = await admin
      .from("external_auth_identities")
      .select("user_id")
      .eq("provider", "intuit")
      .eq("issuer", identityToken.issuer)
      .eq("subject", identityToken.subject)
      .maybeSingle();

    let userId = linkedIdentity?.user_id as string | undefined;
    let localEmail = email;
    let isNewUser = false;
    let createdUserId: string | null = null;

    if (userId) {
      const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
      if (userError || !userData.user?.email) throw new IntuitSsoError("local_user_missing", "Linked account is unavailable.");
      localEmail = userData.user.email;
      await admin.from("external_auth_identities").update({
        email_at_link: email,
        profile,
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("provider", "intuit").eq("issuer", identityToken.issuer).eq("subject", identityToken.subject);
    } else {
      const existingUser = await findAuthUserByEmail(email);
      if (existingUser) {
        matchedExistingUserId = existingUser.id;
        const pending = existingUser.app_metadata?.intuit_sso_pending as { issuer?: string; subject?: string } | undefined;
        if (pending?.issuer === identityToken.issuer && pending.subject === identityToken.subject) {
          userId = existingUser.id;
          localEmail = existingUser.email ?? email;
        } else {
          throw new IntuitSsoError(
            "link_required",
            "An account with this email already exists. Sign in with your password, then link Intuit from Account settings.",
          );
        }
      }
      if (!userId) {
        const displayName = [userInfo.givenName, userInfo.familyName].filter(Boolean).join(" ").trim();
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: displayName },
          app_metadata: {
            intuit_sso_only: true,
            intuit_sso_pending: { issuer: identityToken.issuer, subject: identityToken.subject },
          },
        });
        if (createError || !created.user) throw new IntuitSsoError("user_create_failed", "Unable to create your account.");
        userId = created.user.id;
        createdUserId = created.user.id;
        isNewUser = true;
      } else {
        isNewUser = true;
      }
      const { error: identityError } = await admin.from("external_auth_identities").insert({
        provider: "intuit",
        issuer: identityToken.issuer,
        subject: identityToken.subject,
        user_id: userId,
        email_at_link: email,
        email_verified_at: new Date().toISOString(),
        profile,
        last_login_at: new Date().toISOString(),
      });
      if (identityError) {
        const { data: concurrentIdentity } = await admin
          .from("external_auth_identities")
          .select("user_id")
          .eq("provider", "intuit")
          .eq("issuer", identityToken.issuer)
          .eq("subject", identityToken.subject)
          .maybeSingle();

        if (concurrentIdentity?.user_id !== userId) {
          if (createdUserId === userId) await admin.auth.admin.deleteUser(userId);
          throw new IntuitSsoError("identity_create_failed", "Unable to link your Intuit identity.");
        }
      }
      await admin.auth.admin.updateUserById(userId, {
        app_metadata: { intuit_sso_only: true, intuit_sso_pending: null },
      });
    }

    await createLocalSession(userId, localEmail);
    await admin.from("external_auth_attempts").update({ status: "completed" }).eq("id", attempt.id);
    await logAuditEvent({
      action: "login.success.intuit",
      entityType: "auth_session",
      actorId: userId,
      eventDomain: "auth",
      outcome: "success",
      metadata: { provider: "intuit", is_registration: isNewUser, nonce_claim: nonceClaim },
    });
    return {
      redirectPath: isNewUser
        ? registrationCompletionPath(attempt.return_to)
        : await resolveRedirect(userId, attempt.return_to),
      linked: false,
    };
  } catch (error) {
    await admin.from("external_auth_attempts").update({
      status: "failed",
      failure_code: error instanceof IntuitSsoError ? error.code : "unexpected",
    }).eq("id", attempt.id);
    await logAuditEvent({
      action: "login.failed.intuit",
      entityType: "auth_session",
      eventDomain: "auth",
      outcome: "error",
      severity: "high",
      reasonCode: error instanceof IntuitSsoError ? error.code : "unexpected",
      metadata: {
        provider: "intuit",
        matched_existing_user_id: matchedExistingUserId,
      },
    });
    throw error;
  }
}

export async function cancelIntuitSso(input: { state: string; browserToken: string }) {
  const admin = createSupabaseAdminClient();
  const { data: attempts } = await admin.rpc("consume_external_auth_attempt", {
    p_provider: "intuit",
    p_state_hash: hash(input.state),
    p_browser_hash: hash(input.browserToken),
  });
  const attempt = attempts?.[0] as { id: string } | undefined;
  if (!attempt) return false;
  await admin.from("external_auth_attempts").update({ status: "failed", failure_code: "access_denied" }).eq("id", attempt.id);
  return true;
}
