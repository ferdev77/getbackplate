import { createHmac, timingSafeEqual } from "crypto";

type ReferralTokenPayload = {
  organizationId: string;
  syncConfigCustomerId: string;
};

function getReferralSecret() {
  const secret = process.env.QBO_REFERRAL_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("QBO_REFERRAL_TOKEN_SECRET no configurada");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", getReferralSecret()).update(value).digest("base64url");
}

export function createReferralToken(organizationId: string, syncConfigCustomerId: string): string {
  const payload: ReferralTokenPayload = { organizationId, syncConfigCustomerId };
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifyReferralToken(token: string): ReferralTokenPayload {
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) {
    throw new Error("Token de referido invalido");
  }

  const expected = sign(payloadBase64);
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
    throw new Error("Token de referido invalido");
  }

  return JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8")) as ReferralTokenPayload;
}
