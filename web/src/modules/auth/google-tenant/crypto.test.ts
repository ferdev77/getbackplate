import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptGoogleClientSecret, encryptGoogleClientSecret } from "./crypto";

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";

describe("tenant Google credential encryption", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("encrypts and authenticates the client secret for one organization", () => {
    vi.stubEnv("AUTH_CREDENTIALS_ENCRYPTION_KEY", "test-only-google-oauth-key");
    const encrypted = encryptGoogleClientSecret(ORG_A, "GOCSPX-super-secret");
    expect(encrypted.ciphertext).not.toContain("super-secret");
    expect(decryptGoogleClientSecret(ORG_A, encrypted)).toBe("GOCSPX-super-secret");
  });

  it("cannot move encrypted credentials between tenants", () => {
    vi.stubEnv("AUTH_CREDENTIALS_ENCRYPTION_KEY", "test-only-google-oauth-key");
    const encrypted = encryptGoogleClientSecret(ORG_A, "GOCSPX-super-secret");
    expect(() => decryptGoogleClientSecret(ORG_B, encrypted)).toThrow();
  });

  it("uses fresh randomness and fails closed without a key", () => {
    vi.stubEnv("AUTH_CREDENTIALS_ENCRYPTION_KEY", "test-only-google-oauth-key");
    const first = encryptGoogleClientSecret(ORG_A, "same-secret");
    const second = encryptGoogleClientSecret(ORG_A, "same-secret");
    expect(first).not.toEqual(second);
    vi.stubEnv("AUTH_CREDENTIALS_ENCRYPTION_KEY", "");
    expect(() => encryptGoogleClientSecret(ORG_A, "secret")).toThrow(/required/i);
  });
});
