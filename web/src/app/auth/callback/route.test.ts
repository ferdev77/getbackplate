import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  getUser: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  consumeFlow: vi.fn(),
  getFlow: vi.fn(),
  bindingMatches: vi.fn(),
  postLogin: vi.fn(),
  createBridge: vi.fn(),
  resolveDomain: vi.fn(),
  membership: vi.fn(),
  clearMfa: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({ auth: {
    exchangeCodeForSession: mocks.exchange,
    verifyOtp: vi.fn(),
    getUser: mocks.getUser,
    getSession: mocks.getSession,
    signOut: mocks.signOut,
  } })),
}));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const query = {
          eq: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: mocks.membership,
        };
        return query;
      }),
    })),
  })),
}));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: vi.fn(), logAuthEvent: vi.fn() }));
vi.mock("@/shared/lib/tenant-auth-branding", () => ({ resolveOrganizationIdFromAuthHint: vi.fn(async (id) => id) }));
vi.mock("@/shared/lib/custom-domains", () => ({ resolveOrganizationIdFromReadyAuthDomain: mocks.resolveDomain }));
vi.mock("@/modules/auth/post-login-routing", () => ({
  resolvePostLoginRedirect: mocks.postLogin,
  PostLoginRoutingError: class PostLoginRoutingError extends Error {},
}));
vi.mock("@/modules/auth/domain-session-bridge", () => ({ createDomainBridgeToken: mocks.createBridge }));
vi.mock("@/modules/auth/google-login-flow", () => ({
  consumeGoogleLoginFlow: mocks.consumeFlow,
  getGoogleLoginFlow: mocks.getFlow,
  browserBindingMatches: mocks.bindingMatches,
}));
vi.mock("@/shared/lib/mfa-verification", () => ({ clearMfaVerifiedCookie: mocks.clearMfa }));

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";

describe("GET /auth/callback secure Google flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchange.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: null } } });
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: "access", refresh_token: "refresh" } } });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.postLogin.mockResolvedValue("/app/dashboard");
    mocks.resolveDomain.mockResolvedValue(ORG_ID);
    mocks.membership.mockResolvedValue({ data: { id: "membership" }, error: null });
    mocks.createBridge.mockResolvedValue("bridge-token");
    const flow = {
      phase: "oauth_callback",
      targetHost: "client.example.com",
      targetOrganizationId: ORG_ID,
      organizationIdHint: ORG_ID,
      billingTrack: "platform",
      createdAt: new Date().toISOString(),
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: "gb_google_oauth_0123456789abcdef",
      oauthBindingHash: "oauth-hash",
    };
    mocks.consumeFlow.mockResolvedValue(flow);
    mocks.getFlow.mockResolvedValue(flow);
    mocks.bindingMatches.mockReturnValue(true);
  });

  it("ignores legacy caller-controlled Google and destination markers", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      "https://app.example.com/auth/callback?auth_provider=google&start_host=client.example.com",
    ));

    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.consumeFlow).not.toHaveBeenCalled();
    expect(mocks.createBridge).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.example.com/");
  });

  it("requires a newly exchanged code for a supplied Google flow", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://app.example.com/auth/callback?google_flow=flow"));

    expect(mocks.consumeFlow).not.toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalled();
    expect(mocks.createBridge).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/login?error=");
  });

  it("binds a bridge to the flow host, organization and authenticated user", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://app.example.com/auth/callback?code=fresh-code&google_flow=flow"));

    expect(mocks.exchange).toHaveBeenCalledWith("fresh-code");
    expect(mocks.consumeFlow).toHaveBeenCalledWith("flow");
    expect(mocks.clearMfa).toHaveBeenCalled();
    expect(mocks.createBridge).toHaveBeenCalledWith({
      accessToken: "access",
      refreshToken: "refresh",
      next: "/app/dashboard",
      targetHost: "client.example.com",
      organizationId: ORG_ID,
      userId: USER_ID,
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
    });
    expect(response.headers.get("location")).toBe("https://client.example.com/auth/bridge?token=bridge-token");
  });

  it("does not exchange the OAuth code in a browser missing the canonical binding cookie", async () => {
    mocks.bindingMatches.mockReturnValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://app.example.com/auth/callback?code=stolen&google_flow=flow"));

    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.consumeFlow).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/login?error=");
  });
});
