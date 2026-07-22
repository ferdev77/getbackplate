import { afterEach, describe, expect, it, vi } from "vitest";
import { createOAuthStateToken, verifyOAuthStateToken } from "../oauth-state";

describe("QBO OAuth state", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("signs an organization/user-bound state with a unique nonce", () => {
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "test-secret");
    const first = createOAuthStateToken("org-1", "user-1");
    const second = createOAuthStateToken("org-1", "user-1");

    expect(first).not.toBe(second);
    expect(verifyOAuthStateToken(first)).toMatchObject({ organizationId: "org-1", userId: "user-1" });
  });

  it("rejects tampered and expired state", () => {
    vi.stubEnv("QBO_OAUTH_STATE_SECRET", "test-secret");
    const valid = createOAuthStateToken("org-1", "user-1");
    expect(() => verifyOAuthStateToken(`${valid}x`)).toThrow("Invalid OAuth state");
    expect(() => verifyOAuthStateToken(createOAuthStateToken("org-1", "user-1", -1))).toThrow("OAuth state has expired");
  });
});
