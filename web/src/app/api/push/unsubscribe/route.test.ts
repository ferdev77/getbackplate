import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserMock = vi.fn();
const eqEndpointMock = vi.fn();
const eqUserIdMock = vi.fn(() => ({ eq: eqEndpointMock }));
const updateMock = vi.fn(() => ({ eq: eqUserIdMock }));

const serverClient = {
  auth: { getUser: getUserMock },
};

const adminClient = {
  from: vi.fn((table: string) => {
    if (table === "push_subscriptions") {
      return { update: updateMock };
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
  return new Request("https://app.example.com/api/push/unsubscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/push/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } } });
    eqEndpointMock.mockResolvedValue({ error: null });
  });

  it("rechaza sin usuario autenticado", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { POST } = await import("./route");

    const response = await POST(request({ endpoint: "https://push.example/abc" }) as never);

    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("rechaza sin endpoint", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({}) as never);

    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("desactiva solo la suscripcion de ese endpoint, para ese usuario", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({ endpoint: "https://push.example/abc" }) as never);

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ is_active: false }));
    expect(eqUserIdMock).toHaveBeenCalledWith("user_id", "user-1");
    expect(eqEndpointMock).toHaveBeenCalledWith("endpoint", "https://push.example/abc");
  });

  it("devuelve 500 si falla la actualizacion", async () => {
    eqEndpointMock.mockResolvedValue({ error: { message: "db down" } });
    const { POST } = await import("./route");

    const response = await POST(request({ endpoint: "https://push.example/abc" }) as never);

    expect(response.status).toBe(500);
  });
});
