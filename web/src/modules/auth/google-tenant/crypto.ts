import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function encryptionKey() {
  const source = process.env.AUTH_CREDENTIALS_ENCRYPTION_KEY?.trim()
    || process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!source) throw new Error("AUTH_CREDENTIALS_ENCRYPTION_KEY is required.");
  return createHash("sha256").update(source).digest();
}

function additionalData(organizationId: string) {
  return Buffer.from(`google-oauth:${organizationId}:v1`, "utf8");
}

export function encryptGoogleClientSecret(organizationId: string, clientSecret: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(additionalData(organizationId));
  const ciphertext = Buffer.concat([cipher.update(clientSecret, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptGoogleClientSecret(organizationId: string, encrypted: EncryptedSecret) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAAD(additionalData(organizationId));
  decipher.setAuthTag(Buffer.from(encrypted.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
