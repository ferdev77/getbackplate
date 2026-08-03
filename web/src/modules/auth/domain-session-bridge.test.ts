import { beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    get: vi.fn(async (scope: string, key: string) => values.get(`${scope}:${key}`) ?? null),
    set: vi.fn(async (input: { scope: string; key: string; value: unknown }) => {
      values.set(`${input.scope}:${input.key}`, input.value);
      return true;
    }),
    consume: vi.fn(async (scope: string, key: string) => {
      const runtimeKey = `${scope}:${key}`;
      const value = values.get(runtimeKey) ?? null;
      values.delete(runtimeKey);
      return value;
    }),
  };
});

vi.mock("@/shared/lib/ai-runtime-store", () => ({
  getSharedRuntimeValue: runtime.get,
  setSharedRuntimeValue: runtime.set,
  consumeSharedRuntimeValue: runtime.consume,
}));

describe("domain session bridge", () => {
  beforeEach(() => {
    runtime.values.clear();
    vi.clearAllMocks();
    vi.stubEnv("AUTH_BRIDGE_SECRET", "test-only-domain-bridge-secret");
  });

  it("stores encrypted session material and binds it to host, organization and user", async () => {
    const { createDomainBridgeToken, getDomainBridgeToken } = await import("./domain-session-bridge");
    const payload = {
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      next: "/app/dashboard",
      targetHost: "client.example.com",
      organizationId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
    };

    const token = await createDomainBridgeToken(payload);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify([...runtime.values.values()])).not.toContain("refresh-secret");
    await expect(getDomainBridgeToken(token!)).resolves.toEqual(payload);
  });

  it("consumes a bridge token atomically only once", async () => {
    const { createDomainBridgeToken, consumeDomainBridgeToken } = await import("./domain-session-bridge");
    const token = await createDomainBridgeToken({
      accessToken: "access",
      refreshToken: "refresh",
      next: "/portal/home",
      targetHost: "client.example.com",
      organizationId: "00000000-0000-4000-8000-000000000001",
      userId: "00000000-0000-4000-8000-000000000002",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
    });

    const [first, second] = await Promise.all([
      consumeDomainBridgeToken(token!),
      consumeDomainBridgeToken(token!),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(runtime.consume).toHaveBeenCalledTimes(2);
  });
});
