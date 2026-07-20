import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptJsonPayload, encryptJsonPayload, hashQboRealmId } from "../crypto";

describe("QBO integration crypto", () => {
  const originalKey = process.env.INTEGRATIONS_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "unit-test-integration-key";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    else process.env.INTEGRATIONS_ENCRYPTION_KEY = originalKey;
  });

  it("creates a stable keyed blind index without exposing the realm", () => {
    const realmId = "9341450021098765";
    const hash = hashQboRealmId(realmId);

    expect(hash).toBe(hashQboRealmId(`  ${realmId}  `));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(realmId);
    expect(hash).not.toBe(hashQboRealmId("9341450021098766"));
  });

  it("keeps realmId inside the authenticated encrypted payload", () => {
    const encrypted = encryptJsonPayload({ realmId: "123", refreshToken: "secret" });
    expect(encrypted.ciphertext).not.toContain("123");
    expect(decryptJsonPayload(encrypted)).toEqual({ realmId: "123", refreshToken: "secret" });
  });
});
