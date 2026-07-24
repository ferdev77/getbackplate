import { createHmac, timingSafeEqual } from "crypto";

function getVerifierToken() {
  const token = process.env.QBO_WEBHOOK_VERIFIER_TOKEN?.trim() ?? "";
  if (!token) {
    throw new Error("QBO_WEBHOOK_VERIFIER_TOKEN is not configured");
  }
  return token;
}

export function verifyQboWebhookSignature(rawBody: string | Uint8Array, receivedSignature: string | null) {
  if (!receivedSignature) return false;
  const token = getVerifierToken();
  const expected = createHmac("sha256", token)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("base64");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(receivedSignature.trim(), "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
