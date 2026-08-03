import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import {
  consumeSharedRuntimeValue,
  getSharedRuntimeValue,
  setSharedRuntimeValue,
} from "@/shared/lib/ai-runtime-store";

const BRIDGE_SCOPE = "auth-domain-bridge";
const BRIDGE_TTL_SECONDS = 60;

export type BridgePayload = {
  accessToken: string;
  refreshToken: string;
  next: string;
  targetHost: string;
  organizationId: string;
  userId: string;
  browserBindingCookie: string;
  browserBindingHash: string;
};

type EncryptedBridgePayload = { iv: string; tag: string; ciphertext: string };

function encryptionKey() {
  const secret = process.env.AUTH_BRIDGE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return secret ? createHash("sha256").update(secret).digest() : null;
}

function encryptPayload(payload: BridgePayload): EncryptedBridgePayload | null {
  const key = encryptionKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

function decryptPayload(payload: EncryptedBridgePayload | null): BridgePayload | null {
  const key = encryptionKey();
  if (!key || !payload?.iv || !payload.tag || !payload.ciphertext) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
    const cleartext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(cleartext) as BridgePayload;
  } catch {
    return null;
  }
}

/**
 * OAuth sign-in always completes on the single canonical app domain (the
 * only one Google/Supabase have allow-listed). For a tenant's own custom
 * domain, this hands the freshly-established session to that domain via a
 * short-lived, single-use token instead — so a brand new customer domain
 * never needs to be registered anywhere in Google or Supabase to support
 * "Sign in with Google".
 */
export async function createDomainBridgeToken(payload: BridgePayload): Promise<string | null> {
  const encrypted = encryptPayload(payload);
  if (!encrypted) return null;
  const token = randomBytes(32).toString("base64url");
  try {
    const stored = await setSharedRuntimeValue({
      scope: BRIDGE_SCOPE,
      key: token,
      value: encrypted,
      ttlSeconds: BRIDGE_TTL_SECONDS,
    });
    return stored ? token : null;
  } catch {
    return null;
  }
}

export async function getDomainBridgeToken(token: string): Promise<BridgePayload | null> {
  try {
    const payload = await getSharedRuntimeValue<EncryptedBridgePayload>(BRIDGE_SCOPE, token);
    return decryptPayload(payload);
  } catch {
    return null;
  }
}

export async function consumeDomainBridgeToken(token: string): Promise<BridgePayload | null> {
  try {
    const payload = await consumeSharedRuntimeValue<EncryptedBridgePayload>(BRIDGE_SCOPE, token);
    return decryptPayload(payload);
  } catch {
    return null;
  }
}
