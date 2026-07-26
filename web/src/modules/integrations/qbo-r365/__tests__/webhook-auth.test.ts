import { createHmac } from "crypto";
import { afterEach, describe, expect, it } from "vitest";
import { verifyQboWebhookSignature } from "../webhook-auth";

describe("verifyQboWebhookSignature", () => {
  afterEach(() => {
    delete process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
  });

  it("verifies the exact request bytes", () => {
    process.env.QBO_WEBHOOK_VERIFIER_TOKEN = "verifier";
    const body = Buffer.from('{"value":"á"}', "utf8");
    const signature = createHmac("sha256", "verifier").update(body).digest("base64");

    expect(verifyQboWebhookSignature(body, signature)).toBe(true);
    expect(verifyQboWebhookSignature(Buffer.from('{"value":"a"}', "utf8"), signature)).toBe(false);
  });

  it("rejects missing signatures and fails closed without configuration", () => {
    expect(verifyQboWebhookSignature(Buffer.from("{}"), null)).toBe(false);
    expect(() => verifyQboWebhookSignature(Buffer.from("{}"), "signature")).toThrow("QBO_WEBHOOK_VERIFIER_TOKEN");
  });

  it("accepts string bodies and surrounding signature whitespace but rejects wrong lengths", () => {
    process.env.QBO_WEBHOOK_VERIFIER_TOKEN = "verifier";
    const signature = createHmac("sha256", "verifier").update("{}").digest("base64");
    expect(verifyQboWebhookSignature("{}", `  ${signature}  `)).toBe(true);
    expect(verifyQboWebhookSignature("{}", "short")).toBe(false);
  });
});
