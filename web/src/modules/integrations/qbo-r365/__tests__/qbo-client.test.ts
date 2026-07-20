import { afterEach, describe, expect, it, vi } from "vitest";
import { revokeQboToken } from "../qbo-client";

describe("revokeQboToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats an already-invalid token as successfully revoked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "Invalid token" }),
      { status: 400, headers: { "content-type": "application/json" } },
    )));

    await expect(revokeQboToken({
      clientId: "client",
      clientSecret: "secret",
      token: "expired-token",
    })).resolves.toBeUndefined();
  });

  it("keeps an unexplained 400 revoke failure visible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));

    await expect(revokeQboToken({
      clientId: "client",
      clientSecret: "secret",
      token: "refresh-token",
    })).rejects.toThrow("No se pudo revocar");
  });

  it("keeps transient revoke failures visible to strict callers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    await expect(revokeQboToken({
      clientId: "client",
      clientSecret: "secret",
      token: "refresh-token",
    })).rejects.toThrow("No se pudo revocar");
  });
});
