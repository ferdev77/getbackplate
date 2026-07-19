import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_VERSION = "v1";

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createMfaVerificationToken(input: {
  userId: string;
  secret: string;
  issuedAtMs?: number;
}) {
  const issuedAt = Math.floor((input.issuedAtMs ?? Date.now()) / 1000);
  const payload = `${TOKEN_VERSION}.${issuedAt}.${input.userId}`;
  return `${payload}.${sign(payload, input.secret)}`;
}

export function verifyMfaVerificationToken(input: {
  token: string;
  userId: string;
  secret: string;
  maxAgeSeconds: number;
  nowMs?: number;
}) {
  const [version, issuedAtValue, tokenUserId, signature, ...extra] = input.token.split(".");
  if (version !== TOKEN_VERSION || extra.length > 0 || tokenUserId !== input.userId || !signature) {
    return false;
  }

  const issuedAt = Number(issuedAtValue);
  const now = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (!Number.isInteger(issuedAt) || issuedAt > now + 60 || now - issuedAt > input.maxAgeSeconds) {
    return false;
  }

  const payload = `${version}.${issuedAt}.${tokenUserId}`;
  const expected = Buffer.from(sign(payload, input.secret), "base64url");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
