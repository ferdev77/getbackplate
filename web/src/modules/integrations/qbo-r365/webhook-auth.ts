import { createHmac, timingSafeEqual } from "crypto";

function getVerifierToken() {
  const token = process.env.QBO_WEBHOOK_VERIFIER_TOKEN?.trim() ?? "";
  if (!token) {
    throw new Error("QBO_WEBHOOK_VERIFIER_TOKEN no esta configurado");
  }
  return token;
}

export function verifyQboWebhookSignature(rawBody: string, receivedSignature: string | null) {
  if (!receivedSignature) return false;
  const token = getVerifierToken();
  const expected = createHmac("sha256", token).update(rawBody, "utf8").digest("base64");

  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(receivedSignature.trim(), "utf8");
  if (expectedBuffer.length !== receivedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, receivedBuffer);
}
