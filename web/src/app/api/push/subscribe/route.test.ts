import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const upsertMock = vi.fn();

const serverClient = {
  auth: { getUser: getUserMock },
};

const adminClient = {
  from: vi.fn((table: string) => {
    if (table === "push_subscriptions") {
      return { upsert: upsertMock };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => serverClient),
}));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => adminClient),
}));

function request(body: Record<string, unknown>) {
  return new Request("https://app.example.com/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  endpoint: "https://push.example/abc",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
  userAgent: "test-agent",
  orgId: "org-1",
};

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    upsertMock.mockResolvedValue({ error: null });
  });

  it("rechaza sin usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("./route");

    const response = await POST(request(validBody) as never);

    expect(response.status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rechaza un payload sin endpoint o sin las keys", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({ endpoint: "", keys: {} }) as never);

    expect(response.status).toBe(400);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("guarda la suscripcion con el user_id real, no el que venga en el body", async () => {
    const { POST } = await import("./route");

    const response = await POST(request(validBody) as never);

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        org_id: "org-1",
        endpoint: "https://push.example/abc",
        p256dh: "p256dh-key",
        auth: "auth-key",
        is_active: true,
        user_agent: "test-agent",
      }),
      { onConflict: "user_id,endpoint" },
    );
    // ya no existe notify_integration_alerts: nunca deberia colarse en el upsert
    const [payload] = upsertMock.mock.calls[0];
    expect(payload).not.toHaveProperty("notify_integration_alerts");
  });

  it("devuelve 500 si falla el guardado en la base", async () => {
    upsertMock.mockResolvedValue({ error: { message: "db down" } });
    const { POST } = await import("./route");

    const response = await POST(request(validBody) as never);

    expect(response.status).toBe(500);
  });
});
