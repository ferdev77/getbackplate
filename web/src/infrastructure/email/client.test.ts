import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/infrastructure/notifications/log-notification", () => ({
  logNotification: vi.fn(),
}));

import { sendTransactionalEmail } from "./client";

describe("sendTransactionalEmail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
  });

  it("sends BCC recipients through Brevo", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendTransactionalEmail({
      to: "customer@example.com",
      bcc: ["owner-one@example.com", "owner-two@example.com"],
      subject: "Report",
      html: "<p>Report</p>",
      notification: { source: "test" },
    });

    expect(result).toEqual({ ok: true });
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      to: [{ email: "customer@example.com" }],
      bcc: [{ email: "owner-one@example.com" }, { email: "owner-two@example.com" }],
    });
  });
});
