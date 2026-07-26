import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decryptJsonPayload, encryptJsonPayload, hashQboRealmId } from "../crypto";

function alterBase64(value: string) {
  const bytes = Buffer.from(value, "base64");
  bytes[0] ^= 1;
  return bytes.toString("base64");
}

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

  it("uses fresh randomness when encrypting the same payload", () => {
    const payload = { realmId: "123", refreshToken: "secret" };
    const first = encryptJsonPayload(payload);
    const second = encryptJsonPayload(payload);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decryptJsonPayload(first)).toEqual(payload);
    expect(decryptJsonPayload(second)).toEqual(payload);
  });

  it.each(["ciphertext", "tag", "iv"] as const)(
    "rejects an altered %s",
    (field) => {
      const encrypted = encryptJsonPayload({ realmId: "123", refreshToken: "secret" });
      const altered = { ...encrypted, [field]: alterBase64(encrypted[field]) };

      expect(() => decryptJsonPayload(altered)).toThrow();
    },
  );

  it("rejects a payload encrypted with a different key", () => {
    const encrypted = encryptJsonPayload({ realmId: "123", refreshToken: "secret" });
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "different-unit-test-key";

    expect(() => decryptJsonPayload(encrypted)).toThrow();
  });

  it("fails closed when the encryption key is absent", () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;

    expect(() => encryptJsonPayload({ realmId: "123" })).toThrow(
      "INTEGRATIONS_ENCRYPTION_KEY is not configured",
    );
    expect(() => hashQboRealmId("123")).toThrow(
      "INTEGRATIONS_ENCRYPTION_KEY is not configured",
    );
  });
});
