import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

type EncryptedPayload = {
  ciphertext: string;
  iv: string;
  tag: string;
};

function getEncryptionKey() {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY no configurada");
  }

  return createHash("sha256").update(raw).digest();
}

export function encryptJsonPayload(payload: Record<string, unknown>): EncryptedPayload {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptJsonPayload<T>(input: {
  ciphertext: string | null;
  iv: string | null;
  tag: string | null;
}): T | null {
  if (!input.ciphertext || !input.iv || !input.tag) {
    return null;
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.tag, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.ciphertext, "base64")),
    decipher.final(),
  ]);

  return JSON.parse(decrypted.toString("utf8")) as T;
}
