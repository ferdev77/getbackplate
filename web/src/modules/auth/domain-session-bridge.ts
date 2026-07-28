import "server-only";
import { randomBytes } from "node:crypto";

import {
  getSharedRuntimeValue,
  setSharedRuntimeValue,
  deleteSharedRuntimeValue,
} from "@/shared/lib/ai-runtime-store";

const BRIDGE_SCOPE = "auth-domain-bridge";
const BRIDGE_TTL_SECONDS = 60;

type BridgePayload = {
  accessToken: string;
  refreshToken: string;
  next: string;
};

/**
 * OAuth sign-in always completes on the single canonical app domain (the
 * only one Google/Supabase have allow-listed). For a tenant's own custom
 * domain, this hands the freshly-established session to that domain via a
 * short-lived, single-use token instead — so a brand new customer domain
 * never needs to be registered anywhere in Google or Supabase to support
 * "Sign in with Google".
 */
export async function createDomainBridgeToken(payload: BridgePayload): Promise<string | null> {
  const token = randomBytes(32).toString("base64url");
  const stored = await setSharedRuntimeValue({
    scope: BRIDGE_SCOPE,
    key: token,
    value: payload,
    ttlSeconds: BRIDGE_TTL_SECONDS,
  });
  return stored ? token : null;
}

export async function consumeDomainBridgeToken(token: string): Promise<BridgePayload | null> {
  const payload = await getSharedRuntimeValue<BridgePayload>(BRIDGE_SCOPE, token);
  await deleteSharedRuntimeValue(BRIDGE_SCOPE, token);
  return payload;
}
