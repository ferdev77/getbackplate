import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  resolveDomain: vi.fn(),
  createFlow: vi.fn(),
  consumeFlow: vi.fn(),
  getFlow: vi.fn(),
  createBinding: vi.fn(),
  valueMatches: vi.fn(),
  activeTenantConfig: vi.fn(),
  startTenant: vi.fn(),
  resolveHint: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: { signInWithOAuth: mocks.signIn } })),
}));
vi.mock("@/shared/lib/custom-domains", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/custom-domains")>();
  return { ...original, resolveOrganizationIdFromReadyAuthDomain: mocks.resolveDomain };
});
vi.mock("@/modules/auth/google-login-flow", () => ({
  createGoogleLoginFlow: mocks.createFlow,
  consumeGoogleLoginFlow: mocks.consumeFlow,
  getGoogleLoginFlow: mocks.getFlow,
  createGoogleLoginBrowserBinding: mocks.createBinding,
  browserBindingValueMatches: mocks.valueMatches,
}));
vi.mock("@/modules/auth/google-tenant/service", () => ({
  getActiveTenantGoogleOAuthConfig: mocks.activeTenantConfig,
  startTenantGoogleOAuth: mocks.startTenant,
  TENANT_GOOGLE_BROWSER_COOKIE: "gb_tenant_google_browser",
}));
vi.mock("@/shared/lib/tenant-auth-branding", () => ({
  resolveOrganizationIdFromAuthHint: mocks.resolveHint,
}));
vi.mock("@/shared/lib/ai-runtime-store", () => ({
  applySharedRateLimit: mocks.rateLimit,
}));

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const FLOW_TOKEN = "F".repeat(43);

describe("GET /api/auth/google/start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    mocks.resolveDomain.mockResolvedValue(ORG_ID);
    mocks.createFlow.mockResolvedValue(FLOW_TOKEN);
    mocks.consumeFlow.mockResolvedValue(null);
    mocks.getFlow.mockResolvedValue(null);
    mocks.createBinding.mockImplementation((prefix?: string) => prefix === "gb_google_oauth"
      ? { cookieName: "gb_google_oauth_0123456789abcdef", value: "oauth-binding", hash: "oauth-hash" }
      : { cookieName: "gb_google_flow_0123456789abcdef", value: "browser-binding", hash: "binding-hash" });
    mocks.valueMatches.mockReturnValue(true);
    mocks.signIn.mockResolvedValue({ data: { url: "https://google.example/oauth" }, error: null });
    mocks.activeTenantConfig.mockResolvedValue(null);
    mocks.startTenant.mockResolvedValue({ url: "https://accounts.google.com/tenant-oauth", browserToken: "B".repeat(43) });
    mocks.resolveHint.mockResolvedValue(ORG_ID);
    mocks.rateLimit.mockResolvedValue(true);
  });

  it("derives a custom-domain destination from the actual request host", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      `https://client.example.com/api/auth/google/start?org=00000000-0000-4000-8000-000000000099&start_host=attacker.example.com`,
    ));

    expect(mocks.resolveDomain).toHaveBeenCalledWith("client.example.com");
    expect(mocks.createFlow).toHaveBeenCalledWith({
      phase: "custom_handoff",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: null,
      oauthBindingHash: null,
    });
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('method="post"');
    expect(html).toContain(`name="flow" value="${FLOW_TOKEN}"`);
    expect(html).toContain('name="binding" value="browser-binding"');
    expect(response.headers.get("set-cookie")).toContain("gb_google_flow_0123456789abcdef=browser-binding");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("uses a tested tenant OAuth configuration directly on its custom domain", async () => {
    mocks.activeTenantConfig.mockResolvedValue({ status: "active" });
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://client.example.com/api/auth/google/start?org=${ORG_ID}`));

    expect(mocks.startTenant).toHaveBeenCalledWith({
      organizationId: ORG_ID,
      mode: "login",
      redirectUri: "https://client.example.com/api/auth/google/tenant/callback",
      targetHost: "client.example.com",
      billingTrack: "platform",
    });
    expect(response.headers.get("location")).toBe("https://accounts.google.com/tenant-oauth");
    expect(response.headers.get("set-cookie")).toContain("gb_tenant_google_browser=");
    expect(mocks.createFlow).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("keeps the established relay available when tenant OAuth cannot start", async () => {
    mocks.activeTenantConfig.mockResolvedValue({ status: "active" });
    mocks.startTenant.mockRejectedValue(new Error("temporary failure"));
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://client.example.com/api/auth/google/start?org=${ORG_ID}`));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('method="post"');
    expect(mocks.createFlow).toHaveBeenCalledWith(expect.objectContaining({
      phase: "custom_handoff",
      targetOrganizationId: ORG_ID,
    }));
  });

  it("ignores injected destination parameters on the canonical host", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      `https://app.example.com/api/auth/google/start?org=${ORG_ID}&start_host=attacker.example.com&auth_provider=google`,
    ));

    expect(mocks.createFlow).toHaveBeenCalledWith(expect.objectContaining({
      targetHost: null,
      targetOrganizationId: null,
      organizationIdHint: ORG_ID,
      browserBindingCookie: null,
      browserBindingHash: null,
      oauthBindingCookie: "gb_google_oauth_0123456789abcdef",
      oauthBindingHash: "oauth-hash",
      phase: "oauth_callback",
    }));
    const redirectTo = mocks.signIn.mock.calls[0]?.[0]?.options?.redirectTo as string;
    const callback = new URL(redirectTo);
    expect(callback.searchParams.get("google_flow")).toBe(FLOW_TOKEN);
    expect(callback.searchParams.has("start_host")).toBe(false);
    expect(callback.searchParams.has("auth_provider")).toBe(false);
    expect(response.headers.get("location")).toBe("https://google.example/oauth");
    expect(response.headers.get("set-cookie")).toContain("gb_google_oauth_0123456789abcdef=oauth-binding");
  });

  it("rejects an unknown or expired supplied flow", async () => {
    mocks.getFlow.mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://app.example.com/api/auth/google/start?flow=expired"));

    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("atomically transitions a supplied custom flow into a browser-bound OAuth attempt", async () => {
    const customFlow = {
      phase: "custom_handoff",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: null,
      oauthBindingHash: null,
      createdAt: new Date().toISOString(),
    } as const;
    mocks.getFlow.mockResolvedValueOnce(customFlow);
    mocks.consumeFlow.mockResolvedValueOnce(customFlow);
    const { POST } = await import("./route");
    await POST(new Request("https://app.example.com/api/auth/google/start", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://client.example.com",
      },
      body: new URLSearchParams({ flow: FLOW_TOKEN, binding: "browser-binding" }),
    }));

    expect(mocks.consumeFlow).toHaveBeenCalledWith(FLOW_TOKEN);
    expect(mocks.valueMatches).toHaveBeenCalledWith("browser-binding", "binding-hash");
    expect(mocks.createFlow).toHaveBeenCalledWith(expect.objectContaining({
      targetHost: "client.example.com",
      phase: "oauth_callback",
      browserBindingHash: "binding-hash",
      oauthBindingHash: "oauth-hash",
    }));
  });

  it("rejects an OAuth callback-stage token without consuming it", async () => {
    mocks.getFlow.mockResolvedValueOnce({
      phase: "oauth_callback",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: "gb_google_oauth_0123456789abcdef",
      oauthBindingHash: "oauth-hash",
      createdAt: new Date().toISOString(),
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("https://app.example.com/api/auth/google/start?flow=callback-stage"));

    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.consumeFlow).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("rejects a relay posted from a different browser origin", async () => {
    const customFlow = {
      phase: "custom_handoff",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: null,
      oauthBindingHash: null,
      createdAt: new Date().toISOString(),
    } as const;
    mocks.getFlow.mockResolvedValueOnce(customFlow);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://app.example.com/api/auth/google/start", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://attacker.example.com",
      },
      body: new URLSearchParams({ flow: FLOW_TOKEN, binding: "browser-binding" }),
    }));

    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.consumeFlow).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("accepts the opaque origin emitted by a top-level cross-site form relay", async () => {
    const customFlow = {
      phase: "custom_handoff",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: null,
      oauthBindingHash: null,
      createdAt: new Date().toISOString(),
    } as const;
    mocks.getFlow.mockReset().mockResolvedValue(customFlow);
    mocks.consumeFlow.mockReset().mockResolvedValue(customFlow);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://app.example.com/api/auth/google/start", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "null",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "navigate",
        "sec-fetch-dest": "document",
      },
      body: new URLSearchParams({ flow: FLOW_TOKEN, binding: "browser-binding" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain('location.replace("https://google.example/oauth")');
    expect(mocks.consumeFlow).toHaveBeenCalledWith(FLOW_TOKEN);
    expect(mocks.signIn).toHaveBeenCalledOnce();
  });

  it("rejects an opaque origin that is not a top-level cross-site navigation", async () => {
    mocks.getFlow.mockResolvedValueOnce({
      phase: "custom_handoff",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: null,
      oauthBindingHash: null,
      createdAt: new Date().toISOString(),
    });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://app.example.com/api/auth/google/start", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "null",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
      },
      body: new URLSearchParams({ flow: FLOW_TOKEN, binding: "browser-binding" }),
    }));

    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.consumeFlow).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});
