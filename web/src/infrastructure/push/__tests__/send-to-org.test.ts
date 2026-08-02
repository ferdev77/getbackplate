import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockResult = { data: unknown; error: unknown };

function makeChainable(result: MockResult) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    in: () => chain,
    select: () => chain,
    update: () => chain,
    then: (resolve: (value: MockResult) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

const tableQueues = new Map<string, MockResult[]>();
const fromCalls: string[] = [];

function queueResult(table: string, result: MockResult) {
  const queue = tableQueues.get(table) ?? [];
  queue.push(result);
  tableQueues.set(table, queue);
}

function ok(data: unknown = null) {
  return { data, error: null };
}

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      fromCalls.push(table);
      const queue = tableQueues.get(table) ?? [];
      const result = queue.shift() ?? ok(null);
      return makeChainable(result);
    },
  }),
}));

const sendPushNotification = vi.fn();
vi.mock("../web-push", () => ({
  sendPushNotification: (...args: unknown[]) => sendPushNotification(...args),
}));

const logNotificationsBulk = vi.fn().mockResolvedValue(undefined);
vi.mock("@/infrastructure/notifications/log-notification", () => ({
  logNotificationsBulk: (...args: unknown[]) => logNotificationsBulk(...args),
}));

const payload = { title: "Nuevo aviso", body: "Cuerpo del aviso" };
const options = { source: "test_source", organizationId: "org-1" };

describe("sendPushToUsers / sendPushToOrg", () => {
  beforeEach(() => {
    tableQueues.clear();
    fromCalls.length = 0;
    sendPushNotification.mockReset();
    logNotificationsBulk.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("cuenta un envio exitoso y lo deja registrado en la campanita como push", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-1", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: true });

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 1, expired: 0, failed: 0 });
    expect(logNotificationsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "push", userId: "user-1" }),
    ]);
  });

  it("una suscripcion vencida se cuenta, se desactiva en la base, y no genera fila de push", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-expired", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: false, expired: true });

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 0, expired: 1, failed: 0 });
    // segunda llamada a from("push_subscriptions") es el update que la desactiva
    expect(fromCalls.filter((t) => t === "push_subscriptions")).toHaveLength(2);
    // sin push exitoso, pero el usuario si tenia suscripcion (aunque vencida) -> igual queda en_app
    expect(logNotificationsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "in_app", userId: "user-1" }),
    ]);
  });

  it("un usuario sin ninguna suscripcion activa igual queda registrado en la campanita (in_app)", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([])); // nadie con suscripcion activa

    const result = await sendPushToUsers(["user-sin-push"], payload, options);

    expect(result).toEqual({ sent: 0, expired: 0, failed: 0 });
    expect(logNotificationsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "in_app", userId: "user-sin-push" }),
    ]);
  });

  it("un fallo real (no vencimiento) se cuenta como failed y queda logueado con el motivo real", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-boom", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { statusCode: 500 }));

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 0, expired: 0, failed: 1 });
    expect(console.error).toHaveBeenCalledWith(
      "[push] sendPushNotification failed:",
      expect.objectContaining({
        subscriptionId: "sub-boom",
        userId: "user-1",
        source: "test_source",
        statusCode: 500,
        error: "Provider unavailable",
      }),
    );
    // igual que el email, el fallo real queda registrado (no solo en el log tecnico)
    expect(logNotificationsBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ channel: "push", status: "failed", userId: "user-1" }),
      ]),
    );
  });

  it("sendPushToOrg: un fallo real tambien queda registrado, aunque ahi no exista el respaldo de campanita por targetUserIds", async () => {
    const { sendPushToOrg } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-boom", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { statusCode: 500 }));

    const result = await sendPushToOrg("org-1", payload, { source: "test_source" });

    expect(result).toEqual({ sent: 0, expired: 0, failed: 1 });
    expect(logNotificationsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "push", status: "failed", userId: "user-1" }),
    ]);
  });

  it("con un dispositivo exitoso y otro con error real, no se duplica la fila del mismo usuario", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-ok", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
      { id: "sub-boom", user_id: "user-1", endpoint: "e2", p256dh: "p2", auth: "a2" },
    ]));
    sendPushNotification
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { statusCode: 500 }));

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 1, expired: 0, failed: 1 });
    // una sola fila: la que confirma que si le llego, no una segunda de "failed"
    expect(logNotificationsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "push", status: "sent", userId: "user-1" }),
    ]);
  });

  it("con varios dispositivos del mismo usuario, un solo push exitoso alcanza para no duplicar en_app", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-1", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
      { id: "sub-2", user_id: "user-1", endpoint: "e2", p256dh: "p2", auth: "a2" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, expired: true });

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 1, expired: 1, failed: 0 });
    expect(logNotificationsBulk).toHaveBeenCalledWith([
      expect.objectContaining({ channel: "push", userId: "user-1" }),
    ]);
  });

  it("sendPushToOrg filtra por org_id y no toca nada si no hay suscripciones", async () => {
    const { sendPushToOrg } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([]));

    const result = await sendPushToOrg("org-1", payload, { source: "test_source" });

    expect(result).toEqual({ sent: 0, expired: 0, failed: 0 });
    expect(logNotificationsBulk).not.toHaveBeenCalled();
  });
});
