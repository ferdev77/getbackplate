import { createHmac } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const afterMock = vi.fn();
const insertReceiptMock = vi.fn();
const drainReceiptsMock = vi.fn();

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: afterMock };
});

vi.mock("@/modules/integrations/qbo-r365/qbo-webhook-receipts", () => ({
  insertSignedQboWebhookReceipt: insertReceiptMock,
  drainPendingQboWebhookReceipts: drainReceiptsMock,
}));

function signedRequest(body: string, signature?: string) {
  const bytes = Buffer.from(body, "utf8");
  const validSignature = createHmac("sha256", "verifier").update(bytes).digest("base64");
  return new Request("https://app.example.com/api/webhooks/qbo", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "intuit-signature": signature ?? validSignature,
      "intuit-t-id": "trace-1",
    },
    body: bytes,
  });
}

describe("POST /api/webhooks/qbo", () => {
  beforeEach(() => {
    process.env.QBO_WEBHOOK_VERIFIER_TOKEN = "verifier";
    insertReceiptMock.mockResolvedValue("receipt-1");
    drainReceiptsMock.mockResolvedValue({ processed: 0, results: [] });
  });

  afterEach(() => {
    delete process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
    vi.clearAllMocks();
  });

  it("durably captures signed bytes before acknowledging", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest("not-json-but-signed"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, receiptId: "receipt-1" });
    expect(insertReceiptMock).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({ intuitTid: "trace-1" }),
    );
    expect(JSON.stringify(insertReceiptMock.mock.calls[0]?.[1])).not.toContain("intuit-signature");
    expect(afterMock).toHaveBeenCalledOnce();
  });

  it("rejects invalid signatures without creating a receipt", async () => {
    const { POST } = await import("./route");
    const response = await POST(signedRequest("{}", "invalid-signature"));

    expect(response.status).toBe(401);
    expect(insertReceiptMock).not.toHaveBeenCalled();
  });

  it("returns 503 when webhook verification is not configured", async () => {
    delete process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("./route");
    const response = await POST(signedRequest("{}"));

    expect(response.status).toBe(503);
    expect(insertReceiptMock).not.toHaveBeenCalled();
  });
});
