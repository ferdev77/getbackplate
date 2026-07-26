import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthStateToken, verifyOAuthStateToken } from "../oauth-state";

describe("QBO OAuth state", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("signs an organization/user-bound state with a unique nonce", () => {
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "test-secret");
    const first = createOAuthStateToken("org-1", "user-1");
    const second = createOAuthStateToken("org-1", "user-1");

    expect(first).not.toBe(second);
    expect(verifyOAuthStateToken(first)).toMatchObject({ organizationId: "org-1", userId: "user-1" });
  });

  it.each([
    ["organizationId", "org-2"],
    ["userId", "user-2"],
  ] as const)("rejects a state whose signed %s binding is changed", (field, value) => {
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "test-secret");
    const valid = createOAuthStateToken("org-1", "user-1");
    const [payloadBase64, signature] = valid.split(".");
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));
    const alteredPayload = Buffer.from(
      JSON.stringify({ ...payload, [field]: value }),
      "utf8",
    ).toString("base64url");

    expect(() => verifyOAuthStateToken(`${alteredPayload}.${signature}`)).toThrow(
      "Invalid OAuth state",
    );
  });

  it("rejects state signed with a different secret", () => {
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "first-test-secret");
    const state = createOAuthStateToken("org-1", "user-1");
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "second-test-secret");

    expect(() => verifyOAuthStateToken(state)).toThrow("Invalid OAuth state");
  });

  it("fails closed when the state secret is absent", () => {
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "");

    expect(() => createOAuthStateToken("org-1", "user-1")).toThrow(
      "QBO_OAUTH_STATE_SECRET is not configured",
    );
    expect(() => verifyOAuthStateToken("payload.signature")).toThrow(
      "QBO_OAUTH_STATE_SECRET is not configured",
    );
  });

  it("rejects expired state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "test-secret");
    const state = createOAuthStateToken("org-1", "user-1", 900);

    vi.advanceTimersByTime(901_000);

    expect(() => verifyOAuthStateToken(state)).toThrow("OAuth state has expired");
  });
});
