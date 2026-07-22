import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithIntuitTelemetry, revokeQboToken } from "../qbo-client";

describe("fetchWithIntuitTelemetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("records a successful response and returns the same readable response", async () => {
    const response = new Response("response-body", {
      status: 200,
      headers: { intuit_tid: "trace-123" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const recorder = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithIntuitTelemetry(
      "https://quickbooks.api.intuit.com/resource",
      { method: "POST" },
      { operation: "test.success", endpoint: "/resource", realmId: "realm-1" },
      recorder,
    );

    expect(result).toBe(response);
    await expect(result.text()).resolves.toBe("response-body");
    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({
      operation: "test.success",
      endpoint: "/resource",
      realmId: "realm-1",
      method: "POST",
      statusCode: 200,
      ok: true,
      intuitTid: "trace-123",
      durationMs: expect.any(Number),
    }));
  });

  it("records error responses even when the trace header is absent", async () => {
    const response = new Response("failure", { status: 503 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const recorder = vi.fn().mockResolvedValue(undefined);

    const result = await fetchWithIntuitTelemetry(
      "https://quickbooks.api.intuit.com/resource",
      {},
      { operation: "test.failure", endpoint: "/resource" },
      recorder,
    );

    expect(result).toBe(response);
    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({
      method: "GET",
      statusCode: 503,
      ok: false,
      intuitTid: null,
    }));
  });

  it("does not fail or consume the response when telemetry persistence fails", async () => {
    const response = new Response("still-readable", {
      status: 429,
      headers: { intuit_tid: "trace-rate-limit" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await fetchWithIntuitTelemetry(
      "https://quickbooks.api.intuit.com/resource",
      { method: "GET" },
      { operation: "test.recorder_failure", endpoint: "/resource" },
      vi.fn().mockRejectedValue(new Error("database unavailable")),
    );

    expect(result).toBe(response);
    await expect(result.text()).resolves.toBe("still-readable");
  });
});

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
    })).rejects.toThrow("Unable to revoke");
  });

  it("keeps transient revoke failures visible to strict callers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    await expect(revokeQboToken({
      clientId: "client",
      clientSecret: "secret",
      token: "refresh-token",
    })).rejects.toThrow("Unable to revoke");
  });
});
