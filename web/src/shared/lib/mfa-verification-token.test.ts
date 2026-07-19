import { describe, expect, it } from "vitest";
import { createMfaVerificationToken, verifyMfaVerificationToken } from "./mfa-verification-token";

const NOW = Date.UTC(2026, 6, 19, 12, 0, 0);
const MAX_AGE_SECONDS = 60 * 60 * 12;

function verify(token: string, overrides: Partial<Parameters<typeof verifyMfaVerificationToken>[0]> = {}) {
  return verifyMfaVerificationToken({
    token,
    userId: "user-1",
    secret: "test-secret",
    maxAgeSeconds: MAX_AGE_SECONDS,
    nowMs: NOW,
    ...overrides,
  });
}

describe("MFA verification token", () => {
  it("accepts an authentic token for the same user", () => {
    const token = createMfaVerificationToken({ userId: "user-1", secret: "test-secret", issuedAtMs: NOW });
    expect(verify(token)).toBe(true);
  });

  it("rejects tampering and a different user", () => {
    const token = createMfaVerificationToken({ userId: "user-1", secret: "test-secret", issuedAtMs: NOW });
    expect(verify(`${token.slice(0, -1)}x`)).toBe(false);
    expect(verify(token, { userId: "user-2" })).toBe(false);
  });

  it("rejects expired and implausibly future tokens", () => {
    const expired = createMfaVerificationToken({
      userId: "user-1",
      secret: "test-secret",
      issuedAtMs: NOW - (MAX_AGE_SECONDS + 1) * 1000,
    });
    const future = createMfaVerificationToken({
      userId: "user-1",
      secret: "test-secret",
      issuedAtMs: NOW + 61_000,
    });
    expect(verify(expired)).toBe(false);
    expect(verify(future)).toBe(false);
  });
});
