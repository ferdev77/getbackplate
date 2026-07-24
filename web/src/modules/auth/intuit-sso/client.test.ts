import { generateKeyPair, SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildIntuitIdentityAuthorizeUrl,
  exchangeIntuitIdentityCode,
  fetchIntuitIdentity,
  verifyIntuitIdToken,
} from "./client";
import { createHash } from "node:crypto";
import { safeIntuitReturnPath, validateIntuitNonceClaim } from "./service";

describe("Intuit identity authorization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requests identity scopes without QuickBooks accounting access", () => {
    const url = new URL(buildIntuitIdentityAuthorizeUrl({
      clientId: "client-id",
      redirectUri: "https://app.example.com/api/auth/intuit/callback",
      state: "state-value",
      nonce: "nonce-value",
    }));

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile phone address");
    expect(url.searchParams.get("scope")).not.toContain("com.intuit.quickbooks.accounting");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("nonce")).toBe("nonce-value");
  });

  it("rejects unsafe and recursive return paths", () => {
    expect(safeIntuitReturnPath("https://evil.example")).toBe("/app/dashboard");
    expect(safeIntuitReturnPath("//evil.example")).toBe("/app/dashboard");
    expect(safeIntuitReturnPath("/\\evil.example")).toBe("/app/dashboard");
    expect(safeIntuitReturnPath("/api/auth/intuit/callback")).toBe("/app/dashboard");
    expect(safeIntuitReturnPath("/app/settings")).toBe("/app/settings");
  });

  it("validates the signed issuer, audience, subject, and optional nonce", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ nonce: "expected-nonce" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://oauth.platform.intuit.com/op/v1")
      .setAudience("client-id")
      .setSubject("intuit-user")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifyIntuitIdToken({
      idToken: token,
      clientId: "client-id",
    }, publicKey)).resolves.toEqual({
      issuer: "https://oauth.platform.intuit.com/op/v1",
      subject: "intuit-user",
      nonce: "expected-nonce",
    });
  });

  it("accepts Intuit ID tokens that omit the nonce claim", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://oauth.platform.intuit.com/op/v1")
      .setAudience("client-id")
      .setSubject("intuit-user")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifyIntuitIdToken({
      idToken: token,
      clientId: "client-id",
    }, publicKey)).resolves.toMatchObject({ nonce: null, subject: "intuit-user" });
  });

  it("rejects malformed signed nonce claims", async () => {
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    const token = await new SignJWT({ nonce: 123 })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://oauth.platform.intuit.com/op/v1")
      .setAudience("client-id")
      .setSubject("intuit-user")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);

    await expect(verifyIntuitIdToken({ idToken: token, clientId: "client-id" }, publicKey))
      .rejects.toThrow("nonce");
  });

  it("accepts omitted nonce but rejects a present mismatch", () => {
    const expected = createHash("sha256").update("expected").digest("hex");
    expect(validateIntuitNonceClaim(null, expected)).toBe("omitted");
    expect(validateIntuitNonceClaim("expected", expected)).toBe("matched");
    expect(() => validateIntuitNonceClaim("different", expected)).toThrow("nonce");
  });

  it("records token exchange telemetry without authentication secrets", async () => {
    const recorder = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "sensitive-access-token",
      id_token: "sensitive-id-token",
    }), {
      status: 200,
      headers: { "content-type": "application/json", intuit_tid: "trace-1" },
    })));

    await exchangeIntuitIdentityCode({
      clientId: "client-id",
      clientSecret: "sensitive-client-secret",
      redirectUri: "https://app.example.com/callback",
      code: "sensitive-code",
    }, recorder);

    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({
      operation: "identity.exchange_token",
      endpoint: "/oauth2/v1/tokens/bearer",
      statusCode: 200,
      ok: true,
      intuitTid: "trace-1",
    }));
    const serialized = JSON.stringify(recorder.mock.calls[0]?.[0]);
    expect(serialized).not.toContain("sensitive-");
  });

  it("records userinfo telemetry and ignores recorder failures", async () => {
    const recorder = vi.fn().mockRejectedValue(new Error("telemetry unavailable"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sub: "intuit-user",
      email: "verified@example.com",
      emailVerified: true,
    }), {
      status: 200,
      headers: { "content-type": "application/json", intuit_tid: "trace-2" },
    })));

    await expect(fetchIntuitIdentity("sensitive-access-token", "production", recorder))
      .resolves.toMatchObject({ sub: "intuit-user", emailVerified: true });
    expect(recorder).toHaveBeenCalledWith(expect.objectContaining({
      operation: "identity.userinfo",
      statusCode: 200,
      intuitTid: "trace-2",
    }));
  });
});
