import { createHash } from "node:crypto";
import { generateKeyPair, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { verifyGoogleIdToken } from "./client";

const CLIENT_ID = "123456789-test.apps.googleusercontent.com";

async function token(overrides: Record<string, unknown> = {}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const nonce = "nonce-value";
  const jwt = await new SignJWT({
    email: "admin@example.com",
    email_verified: true,
    nonce,
    azp: CLIENT_ID,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://accounts.google.com")
    .setAudience(CLIENT_ID)
    .setSubject("google-subject")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return { jwt, publicKey, nonceHash: createHash("sha256").update(nonce).digest("hex") };
}

describe("tenant Google ID token verification", () => {
  it("accepts a verified identity for the configured client and nonce", async () => {
    const input = await token();
    await expect(verifyGoogleIdToken({ idToken: input.jwt, clientId: CLIENT_ID, nonceHash: input.nonceHash }, input.publicKey)).resolves.toEqual({
      issuer: "https://accounts.google.com",
      subject: "google-subject",
      email: "admin@example.com",
    });
  });

  it("rejects an unverified email and a mismatched nonce", async () => {
    const unverified = await token({ email_verified: false });
    await expect(verifyGoogleIdToken({ idToken: unverified.jwt, clientId: CLIENT_ID, nonceHash: unverified.nonceHash }, unverified.publicKey)).rejects.toMatchObject({ code: "unverified_identity" });
    const valid = await token();
    await expect(verifyGoogleIdToken({ idToken: valid.jwt, clientId: CLIENT_ID, nonceHash: "wrong" }, valid.publicKey)).rejects.toMatchObject({ code: "nonce_mismatch" });
  });
});
