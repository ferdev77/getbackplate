import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import {
  consumeSharedRuntimeValue,
  getSharedRuntimeValue,
  setSharedRuntimeValue,
} from "@/shared/lib/ai-runtime-store";

const FLOW_SCOPE = "auth-google-login-flow";
const FLOW_TTL_SECONDS = 5 * 60;

export type GoogleLoginFlow = {
  phase: "custom_handoff" | "oauth_callback";
  targetHost: string | null;
  targetOrganizationId: string | null;
  organizationIdHint: string | null;
  billingTrack: "integration" | "platform";
  browserBindingCookie: string | null;
  browserBindingHash: string | null;
  oauthBindingCookie: string | null;
  oauthBindingHash: string | null;
  createdAt: string;
};

export function createGoogleLoginBrowserBinding(prefix = "gb_google_flow") {
  const value = randomBytes(32).toString("base64url");
  return {
    cookieName: `${prefix}_${randomBytes(8).toString("hex")}`,
    value,
    hash: createHash("sha256").update(value).digest("base64url"),
  };
}

export function browserBindingMatches(
  cookieHeader: string | null,
  cookieName: string | null,
  expectedHash: string | null,
) {
  if (!cookieName || !expectedHash || !/^[a-z0-9_]{1,64}$/.test(cookieName)) return false;
  const cookieValue = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1);
  if (!cookieValue) return false;

  try {
    const actual = Buffer.from(createHash("sha256").update(decodeURIComponent(cookieValue)).digest("base64url"));
    const expected = Buffer.from(expectedHash);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function browserBindingValueMatches(value: string, expectedHash: string | null) {
  if (!expectedHash || !/^[A-Za-z0-9_-]{43}$/.test(value)) return false;
  const actual = Buffer.from(createHash("sha256").update(value).digest("base64url"));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createGoogleLoginFlow(
  input: Omit<GoogleLoginFlow, "createdAt">,
): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  try {
    const stored = await setSharedRuntimeValue({
      scope: FLOW_SCOPE,
      key: token,
      value: { ...input, createdAt: new Date().toISOString() },
      ttlSeconds: FLOW_TTL_SECONDS,
    });
    return stored ? token : null;
  } catch {
    return null;
  }
}

export async function getGoogleLoginFlow(token: string) {
  try {
    return await getSharedRuntimeValue<GoogleLoginFlow>(FLOW_SCOPE, token);
  } catch {
    return null;
  }
}

export async function consumeGoogleLoginFlow(token: string) {
  try {
    return await consumeSharedRuntimeValue<GoogleLoginFlow>(FLOW_SCOPE, token);
  } catch {
    return null;
  }
}
