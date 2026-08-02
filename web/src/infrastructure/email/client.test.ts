import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logNotificationsBulk = vi.fn().mockResolvedValue(undefined);
const resolveUserIdByEmail = vi.fn().mockResolvedValue(null);

vi.mock("@/infrastructure/notifications/log-notification", () => ({
  logNotificationsBulk: (...args: unknown[]) => logNotificationsBulk(...args),
  resolveUserIdByEmail: (...args: unknown[]) => resolveUserIdByEmail(...args),
}));

import { sendTransactionalEmail } from "./client";

function loggedRows() {
  return (logNotificationsBulk.mock.calls.at(-1)?.[0] ?? []) as Array<{ channel: string; status: string; userId: string | null }>;
}

describe("sendTransactionalEmail", () => {
  beforeEach(() => {
    logNotificationsBulk.mockClear();
    resolveUserIdByEmail.mockClear().mockResolvedValue(null);
  });

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

  it("cuando se puede resolver el usuario, deja tambien una fila in_app garantizada ademas del email", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
    resolveUserIdByEmail.mockResolvedValue("user-1");

    await sendTransactionalEmail({
      to: "customer@example.com",
      subject: "Report",
      html: "<p>Report</p>",
      notification: { source: "test" },
    });

    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "email", status: "sent", userId: "user-1" }),
        expect.objectContaining({ channel: "in_app", status: "sent", userId: "user-1" }),
      ]),
    );
  });

  it("la fila in_app queda igual aunque el email falle -- el email es el mecanismo de entrega, no la fuente de verdad", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));
    resolveUserIdByEmail.mockResolvedValue("user-1");

    const result = await sendTransactionalEmail({
      to: "customer@example.com",
      subject: "Report",
      html: "<p>Report</p>",
      notification: { source: "test" },
    });

    expect(result.ok).toBe(false);
    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "email", status: "failed", userId: "user-1" }),
        expect.objectContaining({ channel: "in_app", status: "sent", userId: "user-1" }),
      ]),
    );
  });

  it("sin usuario resoluble (destinatario externo), no hay fila in_app -- no hay campanita a donde ponerla", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
    resolveUserIdByEmail.mockResolvedValue(null);

    await sendTransactionalEmail({
      to: "externo@example.com",
      subject: "Report",
      html: "<p>Report</p>",
      notification: { source: "test" },
    });

    expect(loggedRows()).toEqual([expect.objectContaining({ channel: "email", userId: null })]);
  });

  it("userId null explicito (destinatario externo conocido) no intenta resolver por email", async () => {
    process.env.BREVO_API_KEY = "test-key";
    process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 201 })));

    await sendTransactionalEmail({
      to: "externo@example.com",
      subject: "Report",
      html: "<p>Report</p>",
      notification: { source: "landing_seat_request", userId: null },
    });

    expect(resolveUserIdByEmail).not.toHaveBeenCalled();
    expect(loggedRows()).toEqual([expect.objectContaining({ channel: "email", userId: null })]);
  });
});
