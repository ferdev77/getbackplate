import { beforeEach, describe, expect, it, vi } from "vitest";

const sendPushToUsers = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ sent: 1, expired: 0, failed: 0 }),
);
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("../send-to-org", () => ({ sendPushToUsers }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));

const { notifySuperadmins } = await import("../notify-superadmins");

function supabaseFalso(superadminUserIds: string[]) {
  const cliente = {
    from: () => ({
      select: () => Promise.resolve({ data: superadminUserIds.map((id) => ({ user_id: id })), error: null }),
    }),
  };
  createSupabaseAdminClient.mockReturnValue(cliente as never);
}

const payload = { title: "Aviso", body: "Cuerpo", url: "/superadmin/x" };

describe("notifySuperadmins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendPushToUsers.mockResolvedValue({ sent: 1, expired: 0, failed: 0 });
  });

  it("le avisa a todos los superadmins, sin filtrar por quien ya tiene push activo", async () => {
    supabaseFalso(["sa-1", "sa-2", "sa-3"]);

    await notifySuperadmins(payload, { source: "test_source" });

    expect(sendPushToUsers).toHaveBeenCalledWith(
      expect.arrayContaining(["sa-1", "sa-2", "sa-3"]),
      payload,
      { source: "test_source" },
    );
  });

  it("sin superadmins no llama a sendPushToUsers", async () => {
    supabaseFalso([]);

    const result = await notifySuperadmins(payload, { source: "test_source" });

    expect(sendPushToUsers).not.toHaveBeenCalled();
    expect(result).toEqual({ sent: 0, expired: 0, failed: 0 });
  });

  it("no repite ids duplicados", async () => {
    supabaseFalso(["sa-1", "sa-1"]);

    await notifySuperadmins(payload, { source: "test_source" });

    expect(sendPushToUsers.mock.calls[0]?.[0]).toEqual(["sa-1"]);
  });
});
