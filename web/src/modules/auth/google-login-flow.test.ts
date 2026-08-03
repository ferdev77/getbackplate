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

describe("Google login flow", () => {
  beforeEach(() => {
    runtime.values.clear();
    vi.clearAllMocks();
  });

  it("keeps the server-derived destination and is single use", async () => {
    const { createGoogleLoginFlow, getGoogleLoginFlow, consumeGoogleLoginFlow } = await import("./google-login-flow");
    const token = await createGoogleLoginFlow({
      phase: "oauth_callback",
      targetHost: "client.example.com",
      targetOrganizationId: "00000000-0000-4000-8000-000000000001",
      organizationIdHint: "00000000-0000-4000-8000-000000000001",
      billingTrack: "integration",
      browserBindingCookie: "gb_google_flow_0123456789abcdef",
      browserBindingHash: "binding-hash",
      oauthBindingCookie: "gb_google_oauth_0123456789abcdef",
      oauthBindingHash: "oauth-binding-hash",
    });

    await expect(getGoogleLoginFlow(token!)).resolves.toMatchObject({
      targetHost: "client.example.com",
      targetOrganizationId: "00000000-0000-4000-8000-000000000001",
      billingTrack: "integration",
    });
    await expect(consumeGoogleLoginFlow(token!)).resolves.toMatchObject({ targetHost: "client.example.com" });
    await expect(consumeGoogleLoginFlow(token!)).resolves.toBeNull();
  });

  it("fails closed without throwing when the shared store is unavailable", async () => {
    runtime.set.mockRejectedValueOnce(new Error("redis unavailable"));
    const { createGoogleLoginFlow } = await import("./google-login-flow");
    await expect(createGoogleLoginFlow({
      phase: "oauth_callback",
      targetHost: null,
      targetOrganizationId: null,
      organizationIdHint: null,
      billingTrack: "platform",
      browserBindingCookie: null,
      browserBindingHash: null,
      oauthBindingCookie: "gb_google_oauth_0123456789abcdef",
      oauthBindingHash: "oauth-binding-hash",
    })).resolves.toBeNull();
  });
});
