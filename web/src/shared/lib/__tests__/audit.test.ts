import { describe, it, expect } from "vitest";
import { sanitizeMetadataValue } from "../audit";

describe("sanitizeMetadataValue", () => {
  it("returns primitives unchanged", () => {
    expect(sanitizeMetadataValue("hello")).toBe("hello");
    expect(sanitizeMetadataValue(42)).toBe(42);
    expect(sanitizeMetadataValue(true)).toBe(true);
    expect(sanitizeMetadataValue(null)).toBe(null);
  });

  it("redacts password key", () => {
    const result = sanitizeMetadataValue({ password: "secret123" }) as Record<string, unknown>;
    expect(result.password).toBe("[redacted]");
  });

  it("redacts token key", () => {
    const result = sanitizeMetadataValue({ token: "abc123" }) as Record<string, unknown>;
    expect(result.token).toBe("[redacted]");
  });

  it("redacts api_key key", () => {
    const result = sanitizeMetadataValue({ api_key: "key-xyz" }) as Record<string, unknown>;
    expect(result.api_key).toBe("[redacted]");
  });

  it("redacts secret key", () => {
    const result = sanitizeMetadataValue({ secret: "s3cr3t" }) as Record<string, unknown>;
    expect(result.secret).toBe("[redacted]");
  });

  it("keeps non-sensitive keys", () => {
    const result = sanitizeMetadataValue({ userId: "u1", action: "login" }) as Record<string, unknown>;
    expect(result.userId).toBe("u1");
    expect(result.action).toBe("login");
  });

  it("redacts sensitive keys case-insensitively", () => {
    const result = sanitizeMetadataValue({ PASSWORD: "secret" }) as Record<string, unknown>;
    expect(result.PASSWORD).toBe("[redacted]");
  });

  it("redacts nested sensitive keys recursively", () => {
    const result = sanitizeMetadataValue({ user: { password: "nested" } }) as Record<string, Record<string, unknown>>;
    expect(result.user.password).toBe("[redacted]");
  });

  it("sanitizes items inside arrays", () => {
    const result = sanitizeMetadataValue([{ password: "x" }, { name: "ok" }]) as Record<string, unknown>[];
    expect(result[0].password).toBe("[redacted]");
    expect(result[1].name).toBe("ok");
  });

  it("handles empty object", () => {
    expect(sanitizeMetadataValue({})).toEqual({});
  });
});
