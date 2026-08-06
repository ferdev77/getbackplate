import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  mode: vi.fn(),
}));

vi.mock("@/modules/auth/google-tenant/service", () => ({
  completeTenantGoogleOAuth: mocks.complete,
  getTenantGoogleOAuthAttemptMode: mocks.mode,
  TENANT_GOOGLE_BROWSER_COOKIE: "gb_tenant_google_browser",
}));

const STATE = "S".repeat(43);
const BROWSER = "B".repeat(43);

describe("tenant Google OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    mocks.mode.mockResolvedValue("test");
    mocks.complete.mockResolvedValue({ mode: "test", redirectPath: "/app/settings?google_oauth=success" });
  });

  it("completes a browser-bound attempt and clears its cookie", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://client.example.com/api/auth/google/tenant/callback?code=code&state=${STATE}`, {
      headers: { cookie: `gb_tenant_google_browser=${BROWSER}` },
    }));
    expect(mocks.complete).toHaveBeenCalledWith({
      code: "code",
      state: STATE,
      browserToken: BROWSER,
      callbackUri: "https://client.example.com/api/auth/google/tenant/callback",
    });
    expect(response.headers.get("location")).toBe("https://client.example.com/app/settings?google_oauth=success");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns a canceled settings test to settings without consuming it", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://client.example.com/api/auth/google/tenant/callback?error=access_denied&state=${STATE}`, {
      headers: { cookie: `gb_tenant_google_browser=${BROWSER}` },
    }));
    expect(response.headers.get("location")).toContain("/app/settings?google_oauth=error");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("rejects a callback without the browser binding", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://client.example.com/api/auth/google/tenant/callback?code=code&state=${STATE}`));
    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.complete).not.toHaveBeenCalled();
  });
});
