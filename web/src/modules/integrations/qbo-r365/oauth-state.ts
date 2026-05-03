import { createHmac, timingSafeEqual } from "crypto";

type OAuthStatePayload = {
  organizationId: string;
  userId: string;
  iat: number;
  exp: number;
};

function getStateSecret() {
  const secret = process.env.QBO_OAUTH_STATE_SECRET?.trim();
  if (!secret) {
    throw new Error("QBO_OAUTH_STATE_SECRET no configurada");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getStateSecret()).update(value).digest("base64url");
}

export function createOAuthStateToken(organizationId: string, userId: string, ttlSec = 900) {
  const now = Math.floor(Date.now() / 1000);
  const payload: OAuthStatePayload = {
    organizationId,
    userId,
    iat: now,
    exp: now + ttlSec,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifyOAuthStateToken(token: string): OAuthStatePayload {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    throw new Error("State invalido");
  }

  const expected = sign(payloadBase64);
  const received = signature;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    throw new Error("State invalido");
  }

  const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as OAuthStatePayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw new Error("State expirado");
  }

  return payload;
}
