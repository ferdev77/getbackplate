import "server-only";

import { randomBytes } from "node:crypto";

import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { findAuthUserByEmail } from "@/shared/lib/auth-users";
import { clearMfaVerifiedCookie } from "@/shared/lib/mfa-verification";
import { resolvePostLoginRedirect } from "@/modules/auth/post-login-routing";
import { isModuleEnabledForOrganization } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";
import { resolveOrganizationIdFromReadyAuthDomain } from "@/shared/lib/custom-domains";
import { decryptGoogleClientSecret, encryptGoogleClientSecret } from "./crypto";
import { buildGoogleAuthorizeUrl, exchangeGoogleCode, hashValue, TenantGoogleOAuthError, verifyGoogleIdToken } from "./client";

export const TENANT_GOOGLE_BROWSER_COOKIE = "gb_tenant_google_browser";

type ConfigRow = {
  organization_id: string;
  client_id: string;
  client_secret_ciphertext: string;
  client_secret_iv: string;
  client_secret_tag: string;
  credential_version: number;
  tested_version: number | null;
  status: "draft" | "active" | "failed" | "disabled";
  tested_at: string | null;
  last_failure_code: string | null;
  updated_at: string;
};

type AttemptRow = {
  id: string;
  organization_id: string;
  credential_version: number;
  mode: "login" | "test";
  nonce_hash: string;
  redirect_uri: string;
  target_host: string | null;
  target_user_id: string | null;
  billing_track: "platform" | "integration";
};

function publicConfig(row: ConfigRow | null) {
  return row
    ? {
        configured: true,
        clientId: row.client_id,
        secretConfigured: true,
        status: row.status,
        testedAt: row.tested_at,
        failureCode: row.last_failure_code,
        updatedAt: row.updated_at,
      }
    : {
        configured: false,
        clientId: "",
        secretConfigured: false,
        status: "unconfigured" as const,
        testedAt: null,
        failureCode: null,
        updatedAt: null,
      };
}

async function readConfig(organizationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("organization_google_oauth_configs")
    .select("organization_id, client_id, client_secret_ciphertext, client_secret_iv, client_secret_tag, credential_version, tested_version, status, tested_at, last_failure_code, updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new TenantGoogleOAuthError("config_lookup_failed", "Unable to load the Google configuration.");
  return data as ConfigRow | null;
}

export async function getTenantGoogleOAuthStatus(organizationId: string) {
  return publicConfig(await readConfig(organizationId));
}

export async function saveTenantGoogleOAuthConfig(input: {
  organizationId: string;
  userId: string;
  clientId: string;
  clientSecret?: string;
}) {
  const existing = await readConfig(input.organizationId);
  if (!existing && !input.clientSecret) {
    throw new TenantGoogleOAuthError("secret_required", "Google Client Secret is required.");
  }
  const encrypted = input.clientSecret
    ? encryptGoogleClientSecret(input.organizationId, input.clientSecret)
    : {
        ciphertext: existing!.client_secret_ciphertext,
        iv: existing!.client_secret_iv,
        tag: existing!.client_secret_tag,
      };
  const changed = !existing || existing.client_id !== input.clientId || Boolean(input.clientSecret);
  const credentialVersion = existing ? existing.credential_version + (changed ? 1 : 0) : 1;
  const now = new Date().toISOString();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("organization_google_oauth_configs").upsert({
    organization_id: input.organizationId,
    client_id: input.clientId,
    client_secret_ciphertext: encrypted.ciphertext,
    client_secret_iv: encrypted.iv,
    client_secret_tag: encrypted.tag,
    credential_version: credentialVersion,
    tested_version: changed ? null : existing?.tested_version ?? null,
    status: "draft",
    tested_at: changed ? null : existing?.tested_at ?? null,
    tested_by: changed ? null : undefined,
    last_failure_code: null,
    created_by: existing ? undefined : input.userId,
    updated_by: input.userId,
    updated_at: now,
  }, { onConflict: "organization_id" });
  if (error) throw new TenantGoogleOAuthError("config_save_failed", "Unable to save the Google configuration.");
  return getTenantGoogleOAuthStatus(input.organizationId);
}

export async function disableTenantGoogleOAuthConfig(organizationId: string, userId: string) {
  const existing = await readConfig(organizationId);
  if (!existing) return publicConfig(null);
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("organization_google_oauth_configs").update({
    status: "disabled",
    credential_version: existing.credential_version + 1,
    tested_version: null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }).eq("organization_id", organizationId);
  if (error) throw new TenantGoogleOAuthError("config_disable_failed", "Unable to disable the Google configuration.");
  return getTenantGoogleOAuthStatus(organizationId);
}

export async function getActiveTenantGoogleOAuthConfig(organizationId: string) {
  const [row, customBrandingEnabled] = await Promise.all([
    readConfig(organizationId),
    isModuleEnabledForOrganization(organizationId, "custom_branding"),
  ]);
  if (!customBrandingEnabled) return null;
  if (!row || row.status !== "active" || row.tested_version !== row.credential_version) return null;
  return row;
}

function decryptedConfig(row: ConfigRow) {
  return {
    clientId: row.client_id,
    clientSecret: decryptGoogleClientSecret(row.organization_id, {
      ciphertext: row.client_secret_ciphertext,
      iv: row.client_secret_iv,
      tag: row.client_secret_tag,
    }),
    version: row.credential_version,
  };
}

export async function startTenantGoogleOAuth(input: {
  organizationId: string;
  mode: "login" | "test";
  redirectUri: string;
  targetHost: string | null;
  targetUserId?: string | null;
  billingTrack: "platform" | "integration";
}) {
  const row = await readConfig(input.organizationId);
  const validLogin = row?.status === "active" && row.tested_version === row.credential_version;
  const validTest = row?.status === "draft" || row?.status === "failed";
  if (!row || (input.mode === "login" ? !validLogin : !validTest)) {
    throw new TenantGoogleOAuthError("not_configured", "Custom Google sign-in is not active.");
  }
  const state = randomBytes(32).toString("base64url");
  const browserToken = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  const admin = createSupabaseAdminClient();
  await admin.from("organization_google_oauth_attempts")
    .delete()
    .eq("organization_id", input.organizationId)
    .lt("expires_at", new Date().toISOString());
  const { error } = await admin.from("organization_google_oauth_attempts").insert({
    organization_id: input.organizationId,
    credential_version: row.credential_version,
    mode: input.mode,
    state_hash: hashValue(state),
    browser_hash: hashValue(browserToken),
    nonce_hash: hashValue(nonce),
    redirect_uri: input.redirectUri,
    target_host: input.targetHost,
    target_user_id: input.targetUserId ?? null,
    billing_track: input.billingTrack,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (error) throw new TenantGoogleOAuthError("attempt_create_failed", "Unable to start the Google test.");
  return {
    url: buildGoogleAuthorizeUrl({ clientId: row.client_id, redirectUri: input.redirectUri, state, nonce }),
    browserToken,
  };
}

export async function getTenantGoogleOAuthAttemptMode(input: {
  state: string;
  browserToken: string;
  callbackUri: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("organization_google_oauth_attempts")
    .select("mode")
    .eq("state_hash", hashValue(input.state))
    .eq("browser_hash", hashValue(input.browserToken))
    .eq("redirect_uri", input.callbackUri)
    .eq("status", "started")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data?.mode === "test" ? "test" as const : data?.mode === "login" ? "login" as const : null;
}

async function markAttempt(id: string, status: "completed" | "failed", failureCode?: string) {
  const admin = createSupabaseAdminClient();
  await admin.from("organization_google_oauth_attempts").update({
    status,
    failure_code: failureCode ?? null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

async function markTestResult(row: ConfigRow, userId: string | null, success: boolean, failureCode?: string) {
  const admin = createSupabaseAdminClient();
  let query = admin.from("organization_google_oauth_configs").update(success ? {
    status: "active",
    tested_version: row.credential_version,
    tested_at: new Date().toISOString(),
    tested_by: userId,
    last_failure_code: null,
    updated_at: new Date().toISOString(),
  } : {
    status: "failed",
    tested_version: null,
    last_failure_code: failureCode ?? "test_failed",
    updated_at: new Date().toISOString(),
  }).eq("organization_id", row.organization_id).eq("credential_version", row.credential_version);
  if (success) query = query.in("status", ["draft", "failed"]);
  const { data, error } = await query.select("organization_id").maybeSingle();
  if (error || !data) throw new TenantGoogleOAuthError("test_status_failed", "Unable to save the Google test result.");
}

async function resolveTenantUser(
  organizationId: string,
  credentialVersion: number,
  identity: { issuer: string; subject: string; email: string },
) {
  const admin = createSupabaseAdminClient();
  const { data: linked } = await admin
    .from("organization_google_oauth_identities")
    .select("user_id, credential_version")
    .eq("organization_id", organizationId)
    .eq("issuer", identity.issuer)
    .eq("subject", identity.subject)
    .maybeSingle();
  let userId = linked?.user_id as string | undefined;
  let localEmail = identity.email;
  if (userId) {
    const { data } = await admin.auth.admin.getUserById(userId);
    if (!data.user?.email) throw new TenantGoogleOAuthError("local_user_missing", "This linked user is unavailable.");
    localEmail = data.user.email;
  } else {
    const user = await findAuthUserByEmail(identity.email);
    if (!user?.email) throw new TenantGoogleOAuthError("membership_required", "Your account does not have access to this company.");
    userId = user.id;
    localEmail = user.email;
  }
  const { data: membership } = await admin.from("memberships").select("id").eq("organization_id", organizationId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (!membership) throw new TenantGoogleOAuthError("membership_required", "Your account does not have access to this company.");
  if (!linked) {
    const { data: previousLink } = await admin
      .from("organization_google_oauth_identities")
      .select("id, credential_version")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle();
    if (previousLink && Number(previousLink.credential_version) >= credentialVersion) {
      throw new TenantGoogleOAuthError("identity_conflict", "This Google account is already linked differently.");
    }
    const mutation = previousLink
      ? admin.from("organization_google_oauth_identities").update({
          issuer: identity.issuer,
          subject: identity.subject,
          credential_version: credentialVersion,
          email_at_link: identity.email,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", previousLink.id)
      : admin.from("organization_google_oauth_identities").insert({
          organization_id: organizationId,
          issuer: identity.issuer,
          subject: identity.subject,
          user_id: userId,
          credential_version: credentialVersion,
          email_at_link: identity.email,
        });
    const { error } = await mutation;
    if (error) throw new TenantGoogleOAuthError("identity_conflict", "This Google account is already linked differently.");
  } else {
    await admin.from("organization_google_oauth_identities").update({
      credential_version: credentialVersion,
      email_at_link: identity.email,
      last_login_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("organization_id", organizationId).eq("issuer", identity.issuer).eq("subject", identity.subject);
  }
  return { userId, email: localEmail };
}

async function createLocalSession(userId: string, email: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) throw new TenantGoogleOAuthError("session_failed", "Unable to create your session.");
  const server = await createSupabaseServerClient();
  await clearMfaVerifiedCookie();
  const { data: verified, error: verifyError } = await server.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  if (verifyError || verified.user?.id !== userId) {
    await server.auth.signOut().catch(() => undefined);
    throw new TenantGoogleOAuthError("session_failed", "Unable to verify your session.");
  }
}

export async function completeTenantGoogleOAuth(input: {
  code: string;
  state: string;
  browserToken: string;
  callbackUri: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: attempts, error } = await admin.rpc("consume_organization_google_oauth_attempt", {
    p_state_hash: hashValue(input.state),
    p_browser_hash: hashValue(input.browserToken),
  });
  const attempt = attempts?.[0] as AttemptRow | undefined;
  if (error || !attempt || attempt.redirect_uri !== input.callbackUri) {
    throw new TenantGoogleOAuthError("invalid_state", "This Google sign-in request is invalid or expired.");
  }
  const config = await readConfig(attempt.organization_id);
  if (!config || config.credential_version !== attempt.credential_version) {
    await markAttempt(attempt.id, "failed", "credentials_changed");
    const changedError = new TenantGoogleOAuthError("credentials_changed", "The Google credentials changed during sign-in.");
    changedError.mode = attempt.mode;
    throw changedError;
  }
  const [domainOrganizationId, customBrandingEnabled] = await Promise.all([
    resolveOrganizationIdFromReadyAuthDomain(attempt.target_host),
    isModuleEnabledForOrganization(attempt.organization_id, "custom_branding"),
  ]);
  if (domainOrganizationId !== attempt.organization_id || !customBrandingEnabled) {
    await markAttempt(attempt.id, "failed", "domain_changed");
    const domainError = new TenantGoogleOAuthError("domain_changed", "The custom domain is no longer available for Google sign-in.");
    domainError.mode = attempt.mode;
    throw domainError;
  }
  if (attempt.mode === "login" && (config.status !== "active" || config.tested_version !== config.credential_version)) {
    await markAttempt(attempt.id, "failed", "config_inactive");
    const inactiveError = new TenantGoogleOAuthError("config_inactive", "Custom Google sign-in is no longer active.");
    inactiveError.mode = attempt.mode;
    throw inactiveError;
  }
  if (attempt.mode === "test" && config.status !== "draft" && config.status !== "failed") {
    await markAttempt(attempt.id, "failed", "test_invalidated");
    const invalidatedError = new TenantGoogleOAuthError("test_invalidated", "This Google test is no longer active.");
    invalidatedError.mode = attempt.mode;
    throw invalidatedError;
  }
  let localSessionCreated = false;
  try {
    const credentials = decryptedConfig(config);
    const idToken = await exchangeGoogleCode({
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: attempt.redirect_uri,
      code: input.code,
    });
    const identity = await verifyGoogleIdToken({ idToken, clientId: credentials.clientId, nonceHash: attempt.nonce_hash });
    if (attempt.mode === "test") {
      const { data: testerMembership } = await admin
        .from("memberships")
        .select("id, roles!inner(code)")
        .eq("organization_id", attempt.organization_id)
        .eq("user_id", attempt.target_user_id)
        .eq("status", "active")
        .eq("roles.code", "company_admin")
        .maybeSingle();
      if (!testerMembership) throw new TenantGoogleOAuthError("tester_access_revoked", "Your company administrator access changed during the test.");
      await markTestResult(config, attempt.target_user_id, true);
      await markAttempt(attempt.id, "completed");
      await logAuditEvent({
        action: "organization.google_oauth.test_succeeded",
        entityType: "organization_google_oauth_config",
        organizationId: attempt.organization_id,
        actorId: attempt.target_user_id,
        eventDomain: "security",
        outcome: "success",
        severity: "high",
      });
      return { mode: "test" as const, organizationId: attempt.organization_id, redirectPath: "/app/settings?google_oauth=success" };
    }
    const user = await resolveTenantUser(attempt.organization_id, config.credential_version, identity);
    await createLocalSession(user.userId, user.email);
    localSessionCreated = true;
    const redirectPath = await resolvePostLoginRedirect({
      userId: user.userId,
      email: user.email,
      organizationIdHint: attempt.organization_id,
      companyDashboardPath: `/app/dashboard?billingTrack=${attempt.billing_track}`,
      provider: "google",
    });
    await markAttempt(attempt.id, "completed");
    return { mode: "login" as const, organizationId: attempt.organization_id, redirectPath };
  } catch (caught) {
    const code = caught instanceof TenantGoogleOAuthError ? caught.code : "oauth_failed";
    if (localSessionCreated) {
      try {
        const server = await createSupabaseServerClient();
        await server.auth.signOut();
      } catch {
        // The original authentication error remains the actionable failure.
      }
    }
    await markAttempt(attempt.id, "failed", code);
    if (attempt.mode === "login" && code === "invalid_credentials") {
      await admin.from("organization_google_oauth_configs").update({
        status: "failed",
        tested_version: null,
        last_failure_code: code,
        updated_at: new Date().toISOString(),
      }).eq("organization_id", attempt.organization_id).eq("credential_version", attempt.credential_version);
    }
    let finalError = caught;
    if (attempt.mode === "test") {
      try {
        await markTestResult(config, attempt.target_user_id, false, code);
      } catch (statusError) {
        finalError = statusError;
      }
    }
    if (attempt.mode === "test") {
      await logAuditEvent({
        action: "organization.google_oauth.test_failed",
        entityType: "organization_google_oauth_config",
        organizationId: attempt.organization_id,
        actorId: attempt.target_user_id,
        eventDomain: "security",
        outcome: "error",
        severity: "high",
        reasonCode: code,
      });
    }
    if (finalError instanceof TenantGoogleOAuthError) finalError.mode = attempt.mode;
    throw finalError;
  }
}
