import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { buildIntuitIdentityAuthorizeUrl, verifyIntuitIdToken } from "./client";
import { safeIntuitReturnPath } from "./service";

describe("Intuit identity authorization", () => {
  it("requests identity scopes without QuickBooks accounting access", () => {
    const url = new URL(buildIntuitIdentityAuthorizeUrl({
      clientId: "client-id",
      redirectUri: "https://app.example.com/api/auth/intuit/callback",
      state: "state-value",
      nonce: "nonce-value",
    }));

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
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

  it("validates the signed issuer, audience, subject, and nonce", async () => {
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
      nonce: "expected-nonce",
    }, publicKey)).resolves.toEqual({
      issuer: "https://oauth.platform.intuit.com/op/v1",
      subject: "intuit-user",
    });

    await expect(verifyIntuitIdToken({
      idToken: token,
      clientId: "client-id",
      nonce: "wrong-nonce",
    }, publicKey)).rejects.toThrow("nonce");
  });
});
