import { createRemoteJWKSet, jwtVerify } from "jose";

const INTUIT_ISSUER = "https://oauth.platform.intuit.com/op/v1";
const INTUIT_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const INTUIT_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const INTUIT_USERINFO_URL = "https://accounts.platform.intuit.com/v1/openid_connect/userinfo";
const INTUIT_SANDBOX_USERINFO_URL = "https://sandbox-accounts.platform.intuit.com/v1/openid_connect/userinfo";
const INTUIT_JWKS = createRemoteJWKSet(new URL("https://oauth.platform.intuit.com/op/v1/jwks"));

export type IntuitUserInfo = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  givenName?: string;
  familyName?: string;
};

function basicAuth(clientId: string, clientSecret: string) {
  return Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
}

export function buildIntuitIdentityAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
}) {
  const url = new URL(INTUIT_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  return url.toString();
}

export async function exchangeIntuitIdentityCode(input: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
  });
  const response = await fetch(INTUIT_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(input.clientId, input.clientSecret)}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    id_token?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token || !data.id_token) {
    throw new Error(data.error_description || "Intuit did not return a valid identity token.");
  }
  return { accessToken: data.access_token, idToken: data.id_token };
}

export async function verifyIntuitIdToken(input: {
  idToken: string;
  clientId: string;
  nonce: string;
}, verificationKey: CryptoKey | typeof INTUIT_JWKS = INTUIT_JWKS) {
  const options = {
    algorithms: ["RS256"],
    issuer: INTUIT_ISSUER,
    audience: input.clientId,
    clockTolerance: 60,
    requiredClaims: ["exp", "iat", "sub", "nonce"],
  };
  const { payload, protectedHeader } = typeof verificationKey === "function"
    ? await jwtVerify(input.idToken, verificationKey, options)
    : await jwtVerify(input.idToken, verificationKey, options);
  if (protectedHeader.alg !== "RS256" || !protectedHeader.kid) {
    throw new Error("Intuit identity token header is invalid.");
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Intuit identity token has no subject.");
  }
  if (typeof payload.iat !== "number" || payload.iat > Math.floor(Date.now() / 1000) + 60) {
    throw new Error("Intuit identity token issue time is invalid.");
  }
  if (payload.nonce !== input.nonce) {
    throw new Error("Intuit identity token nonce does not match.");
  }
  if (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== input.clientId) {
    throw new Error("Intuit identity token authorized party is invalid.");
  }
  return { issuer: INTUIT_ISSUER, subject: payload.sub };
}

export async function fetchIntuitIdentity(
  accessToken: string,
  environment: "production" | "sandbox" = "production",
): Promise<IntuitUserInfo> {
  const response = await fetch(environment === "sandbox" ? INTUIT_SANDBOX_USERINFO_URL : INTUIT_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  const data = (await response.json().catch(() => ({}))) as Partial<IntuitUserInfo> & {
    error_description?: string;
  };
  if (!response.ok || !data.sub) {
    throw new Error(data.error_description || "Unable to retrieve the Intuit identity.");
  }
  return data as IntuitUserInfo;
}
