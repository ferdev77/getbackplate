import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchQboCompanyInfo,
  fetchQboCustomers,
  fetchQboCrudoTransaction,
  fetchQboRawTransaction,
  fetchQboSalesTransactions,
  fetchWithIntuitTelemetry,
  QboAuthorizationError,
  refreshQboAccessToken,
  revokeQboToken,
} from "../qbo-client";

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

  it("recognizes an already-invalid token from error_description", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: "invalid_token", error_description: "Token is invalid" }),
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

describe("QuickBooks authorization failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("classifies invalid_grant refresh failures as a confirmed revocation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_grant",
      error_description: "The refresh token is invalid or has been revoked.",
    }), { status: 400, headers: { "content-type": "application/json" } })));

    const request = refreshQboAccessToken({
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "revoked-token",
    });

    await expect(request).rejects.toMatchObject({
      name: "QboAuthorizationError",
      revoked: true,
    });
  });

  it("does not classify a transient token endpoint failure as a revocation", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "temporarily_unavailable",
      error_description: "Try again later.",
    }), { status: 503, headers: { "content-type": "application/json" } })));

    const request = refreshQboAccessToken({
      clientId: "client",
      clientSecret: "secret",
      refreshToken: "valid-token",
    });

    await expect(request).rejects.not.toBeInstanceOf(QboAuthorizationError);
  });

  it("classifies a 401 accounting response so callers can refresh once", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      Fault: { Error: [{ code: "3200", Detail: "message=AuthenticationFailed" }] },
    }), { status: 401, headers: { "content-type": "application/json" } })));

    await expect(fetchQboCustomers({
      accessToken: "expired-access-token",
      realmId: "realm-1",
    })).rejects.toMatchObject({
      name: "QboAuthorizationError",
      revoked: false,
    });
  });

  it("classifies QBO fault 3100 as an authorization failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      Fault: { Error: [{ code: "3100", Detail: "ApplicationAuthorizationFailed" }] },
    }), { status: 400, headers: { "content-type": "application/json" } })));

    await expect(fetchQboCustomers({
      accessToken: "access-token",
      realmId: "realm-1",
    })).rejects.toBeInstanceOf(QboAuthorizationError);
  });

  it("does not classify a transient accounting failure as an authorization failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      Fault: { Error: [{ code: "500", Detail: "Service unavailable" }] },
    }), { status: 503, headers: { "content-type": "application/json" } })));

    const request = fetchQboCustomers({
      accessToken: "access-token",
      realmId: "realm-1",
    });

    await expect(request).rejects.not.toBeInstanceOf(QboAuthorizationError);
  });

  it("confirms that the exchanged token can read CompanyInfo for the callback realm", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      CompanyInfo: { Id: "realm-1" },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(fetchQboCompanyInfo({
      accessToken: "access-token",
      realmId: "realm-1",
    })).resolves.toBeUndefined();
  });

  it("does not confuse the internal CompanyInfo ID with the callback realm ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      CompanyInfo: { Id: "different-realm" },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(fetchQboCompanyInfo({
      accessToken: "access-token",
      realmId: "realm-1",
    })).resolves.toBeUndefined();
  });

  it("rejects a CompanyInfo response without a company payload", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({}), {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(fetchQboCompanyInfo({
      accessToken: "access-token",
      realmId: "realm-1",
    })).rejects.toThrow("confirm");
  });
});

describe("QuickBooks entity lookup", () => {
  it("rejects IDs that could alter the QBO query", async () => {
    const input = {
      accessToken: "access-token",
      realmId: "realm-1",
      invoiceId: "1' OR '1'='1",
    };

    await expect(fetchQboRawTransaction(input)).rejects.toThrow("Invalid QuickBooks entity ID");
    await expect(fetchQboCrudoTransaction(input)).rejects.toThrow("Invalid QuickBooks entity ID");
  });
});

describe("QuickBooks query deadlines", () => {
  it("stops reconciliation queries after their runtime budget", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchQboSalesTransactions({
      accessToken: "access-token",
      realmId: "realm-1",
      sinceIso: new Date().toISOString(),
      skipSalesReceipts: true,
      deadlineEpochMs: Date.now() - 1,
    })).rejects.toThrow("deadline");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
