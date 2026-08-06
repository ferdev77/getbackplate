import "server-only";

import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const REQUEST_TIMEOUT_MS = 15_000;

export function buildGoogleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}) {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeGoogleCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    id_token?: string;
    error?: string;
  };
  if (!response.ok || !payload.id_token) {
    throw new TenantGoogleOAuthError(
      payload.error === "invalid_client" ? "invalid_credentials" : "token_exchange_failed",
      "Google rejected the OAuth configuration.",
    );
  }
  return payload.id_token;
}

export async function verifyGoogleIdToken(input: {
  idToken: string;
  clientId: string;
  nonceHash: string;
}, verificationKey: CryptoKey | typeof GOOGLE_JWKS = GOOGLE_JWKS) {
  const options = {
    algorithms: ["RS256"],
    issuer: GOOGLE_ISSUERS,
    audience: input.clientId,
    clockTolerance: 60,
    requiredClaims: ["exp", "iat", "sub", "nonce", "email"],
  };
  const { payload, protectedHeader } = typeof verificationKey === "function"
    ? await jwtVerify(input.idToken, verificationKey, options)
    : await jwtVerify(input.idToken, verificationKey, options);
  if (protectedHeader.alg !== "RS256" || !protectedHeader.kid) {
    throw new TenantGoogleOAuthError("invalid_token", "Google returned an invalid identity token.");
  }
  if (typeof payload.iat !== "number" || payload.iat > Math.floor(Date.now() / 1000) + 60) {
    throw new TenantGoogleOAuthError("invalid_token", "Google returned an invalid identity token.");
  }
  if (payload.azp !== undefined && payload.azp !== input.clientId) {
    throw new TenantGoogleOAuthError("invalid_token", "Google returned an invalid identity token.");
  }
  const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
  if (!nonce || hashValue(nonce) !== input.nonceHash) {
    throw new TenantGoogleOAuthError("nonce_mismatch", "The Google sign-in request could not be verified.");
  }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (!email || payload.email_verified !== true || typeof payload.sub !== "string" || !payload.sub) {
    throw new TenantGoogleOAuthError("unverified_identity", "Google did not return a verified email address.");
  }
  return {
    issuer: "https://accounts.google.com",
    subject: payload.sub,
    email,
  };
}

export function hashValue(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export class TenantGoogleOAuthError extends Error {
  mode?: "login" | "test";

  constructor(public code: string, message: string) {
    super(message);
  }
}
