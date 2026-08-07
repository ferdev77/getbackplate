import { beforeEach, describe, expect, it, vi } from "vitest";

const notifySuperadmins = vi.hoisted(() => vi.fn().mockResolvedValue({ sent: 1, expired: 0, failed: 0 }));
const sendPushToUsers = vi.hoisted(() => vi.fn().mockResolvedValue({ sent: 0, expired: 0, failed: 0 }));
const createSupabaseAdminClient = vi.hoisted(() => vi.fn());

vi.mock("../notify-superadmins", () => ({ notifySuperadmins }));
vi.mock("../send-to-org", () => ({ sendPushToUsers }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));

const { notifyIntegrationEvent } = await import("../integration-alerts");

function thenable<T>(result: T) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (value: T) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe("notifyIntegrationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseAdminClient.mockReturnValue({
      from: (table: string) => table === "organizations"
        ? thenable({ data: { name: "Review Restaurant" }, error: null })
        : thenable({ data: [{ user_id: "admin-1" }, { user_id: "admin-1" }, { user_id: "admin-2" }], error: null }),
    });
  });

  it("notifica a los company_admin cuando una factura llega a R365", async () => {
    await notifyIntegrationEvent({
      kind: "send_success",
      organizationId: "org-1",
      customerName: "Downtown",
      docNumber: "INV-1001",
    });

    expect(sendPushToUsers).toHaveBeenCalledWith(
      ["admin-1", "admin-2"],
      expect.objectContaining({
        title: "Invoice sent to R365",
        url: "/app/integrations/quickbooks",
      }),
      { source: "integration_alert", organizationId: "org-1" },
    );
    expect(notifySuperadmins).toHaveBeenCalledOnce();
  });

  it("mantiene las alertas de error solo en el canal operativo de superadmin", async () => {
    await notifyIntegrationEvent({
      kind: "send_failed",
      organizationId: "org-1",
      customerName: "Downtown",
      entityId: "6",
      errorMessage: "FTP unavailable",
    });

    expect(notifySuperadmins).toHaveBeenCalledOnce();
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});
