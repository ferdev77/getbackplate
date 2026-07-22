import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = 1 as const;
const INVALID_TOKEN_ERROR = "This preferences link is invalid";
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

export type QboReportPreferenceTokenPayload = {
  version: typeof TOKEN_VERSION;
  subscriptionId: string;
  nonce: string;
};

function getTokenSecret(): string {
  const secret = process.env.QBO_REPORT_PREFERENCES_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("QBO report preference token is unavailable");
  }
  return secret;
}

function sign(payload: string): Buffer {
  return createHmac("sha256", getTokenSecret()).update(payload).digest();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createQboReportPreferenceToken(input: {
  id: string;
  tokenNonce: string;
}): string {
  const payload: QboReportPreferenceTokenPayload = {
    version: TOKEN_VERSION,
    subscriptionId: input.id,
    nonce: input.tokenNonce,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload).toString("base64url")}`;
}

export function verifyQboReportPreferenceToken(token: string): QboReportPreferenceTokenPayload {
  try {
    const parts = token.split(".");
    if (
      parts.length !== 2
      || !parts[0]
      || !BASE64URL_PATTERN.test(parts[0])
      || parts[1]?.length !== 43
      || !BASE64URL_PATTERN.test(parts[1])
    ) throw new Error();

    const expected = sign(parts[0]);
    const received = Buffer.from(parts[1], "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw new Error();

    const payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Partial<QboReportPreferenceTokenPayload>;
    if (payload.version !== TOKEN_VERSION || !isUuid(payload.subscriptionId) || !isUuid(payload.nonce)) {
      throw new Error();
    }

    return payload as QboReportPreferenceTokenPayload;
  } catch {
    throw new Error(INVALID_TOKEN_ERROR);
  }
}
