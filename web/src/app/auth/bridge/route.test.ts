import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  consume: vi.fn(),
  resolveDomain: vi.fn(),
  membership: vi.fn(),
  setSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
  clearMfa: vi.fn(),
}));

vi.mock("@/modules/auth/domain-session-bridge", () => ({
  getDomainBridgeToken: mocks.preview,
  consumeDomainBridgeToken: mocks.consume,
}));
vi.mock("@/shared/lib/custom-domains", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/shared/lib/custom-domains")>();
  return { ...original, resolveOrganizationIdFromReadyAuthDomain: mocks.resolveDomain };
});
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const query = { eq: vi.fn(() => query), limit: vi.fn(() => query), maybeSingle: mocks.membership };
        return query;
      }),
    })),
  })),
}));
vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { setSession: mocks.setSession, getUser: mocks.getUser, signOut: mocks.signOut },
  })),
}));
vi.mock("@/shared/lib/mfa-verification", () => ({ clearMfaVerifiedCookie: mocks.clearMfa }));

const TOKEN = "A".repeat(43);
const ORG_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const BINDING_VALUE = "browser-binding";
const BINDING_COOKIE = "gb_google_flow_0123456789abcdef";
const payload = {
  accessToken: "access",
  refreshToken: "refresh",
  next: "/app/dashboard",
  targetHost: "client.example.com",
  organizationId: ORG_ID,
  userId: USER_ID,
  browserBindingCookie: BINDING_COOKIE,
  browserBindingHash: createHash("sha256").update(BINDING_VALUE).digest("base64url"),
};

function postRequest(host = "client.example.com", binding = BINDING_VALUE) {
  return new Request(`https://${host}/auth/bridge`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: `${BINDING_COOKIE}=${binding}`,
    },
    body: new URLSearchParams({ token: TOKEN }),
  });
}

describe("/auth/bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue(payload);
    mocks.consume.mockResolvedValue(payload);
    mocks.resolveDomain.mockResolvedValue(ORG_ID);
    mocks.membership.mockResolvedValue({ data: { id: "membership" }, error: null });
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it("uses a no-store auto-submit page without consuming on GET", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://client.example.com/auth/bridge?token=${TOKEN}`, {
      headers: { cookie: `${BINDING_COOKIE}=${BINDING_VALUE}` },
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.text()).toContain('method="post"');
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("does not consume a token presented on the wrong host", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(`https://attacker.example.com/auth/bridge?token=${TOKEN}`, {
      headers: { cookie: `${BINDING_COOKIE}=${BINDING_VALUE}` },
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("attacker.example.com/auth/login");
    expect(mocks.consume).not.toHaveBeenCalled();
  });

  it("redeems once only after host, organization and membership checks", async () => {
    const { POST } = await import("./route");
    const response = await POST(postRequest());

    expect(mocks.resolveDomain).toHaveBeenCalledWith("client.example.com");
    expect(mocks.consume).toHaveBeenCalledWith(TOKEN);
    expect(mocks.clearMfa).toHaveBeenCalled();
    expect(mocks.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(response.headers.get("location")).toBe("https://client.example.com/app/dashboard");
    expect(response.headers.get("set-cookie")).toContain(`${BINDING_COOKIE}=`);
  });

  it("rejects a replay after atomic consumption", async () => {
    mocks.consume.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(postRequest());

    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("rejects the bridge URL in a different browser without the binding cookie", async () => {
    const { POST } = await import("./route");
    const response = await POST(postRequest("client.example.com", "different-browser"));

    expect(response.headers.get("location")).toContain("/auth/login?error=");
    expect(mocks.consume).not.toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});
