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

function loggedRows() {
  return (logNotificationsBulk.mock.calls.at(-1)?.[0] ?? []) as Array<{ channel: string; status: string; userId: string }>;
}

describe("sendPushToUsers", () => {
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

  it("un envio exitoso deja dos filas: push (diagnostico) e in_app (garantizada)", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-1", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: true });

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 1, expired: 0, failed: 0 });
    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "push", status: "sent", userId: "user-1" }),
        expect.objectContaining({ channel: "in_app", userId: "user-1" }),
      ]),
    );
    expect(loggedRows()).toHaveLength(2);
  });

  it("una suscripcion vencida se cuenta, se desactiva en la base, y la campanita (in_app) queda igual", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-expired", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: false, expired: true });

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 0, expired: 1, failed: 0 });
    // segunda llamada a from("push_subscriptions") es el update que la desactiva
    expect(fromCalls.filter((t) => t === "push_subscriptions")).toHaveLength(2);
    expect(loggedRows()).toEqual([expect.objectContaining({ channel: "in_app", userId: "user-1" })]);
  });

  it("un usuario sin ninguna suscripcion activa igual queda registrado en la campanita (in_app)", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([])); // nadie con suscripcion activa

    const result = await sendPushToUsers(["user-sin-push"], payload, options);

    expect(result).toEqual({ sent: 0, expired: 0, failed: 0 });
    expect(loggedRows()).toEqual([expect.objectContaining({ channel: "in_app", userId: "user-sin-push" })]);
  });

  it("un fallo real (no vencimiento) se cuenta como failed, queda logueado con el motivo real, y la campanita (in_app) no depende de eso", async () => {
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
    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "push", status: "failed", userId: "user-1" }),
        expect.objectContaining({ channel: "in_app", userId: "user-1" }),
      ]),
    );
  });

  it("con un dispositivo exitoso y otro con error real, no se duplica la fila push (pero in_app sigue siendo una sola)", async () => {
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
    // una sola fila push (la exitosa, no una segunda de "failed") + una sola fila in_app
    expect(loggedRows()).toEqual([
      expect.objectContaining({ channel: "push", status: "sent", userId: "user-1" }),
      expect.objectContaining({ channel: "in_app", userId: "user-1" }),
    ]);
  });

  it("con varios dispositivos del mismo usuario, un solo push exitoso alcanza para no duplicar la fila push", async () => {
    const { sendPushToUsers } = await import("../send-to-org");

    queueResult("push_subscriptions", ok([
      { id: "sub-1", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
      { id: "sub-2", user_id: "user-1", endpoint: "e2", p256dh: "p2", auth: "a2" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false, expired: true });

    const result = await sendPushToUsers(["user-1"], payload, options);

    expect(result).toEqual({ sent: 1, expired: 1, failed: 0 });
    expect(loggedRows().filter((r) => r.channel === "push")).toHaveLength(1);
    expect(loggedRows().filter((r) => r.channel === "in_app")).toHaveLength(1);
  });
});

describe("sendPushToOrg", () => {
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

  it("resuelve los miembros reales de la organizacion, no solo quien ya tiene push", async () => {
    const { sendPushToOrg } = await import("../send-to-org");

    queueResult("memberships", ok([{ user_id: "admin-1" }, { user_id: "empleado-1" }]));
    queueResult("push_subscriptions", ok([
      { id: "sub-1", user_id: "admin-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockResolvedValueOnce({ success: true });

    const result = await sendPushToOrg("org-1", payload, { source: "test_source" });

    expect(result).toEqual({ sent: 1, expired: 0, failed: 0 });
    // empleado-1 no tenia suscripcion, pero igual queda con su fila in_app garantizada
    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "push", status: "sent", userId: "admin-1" }),
        expect.objectContaining({ channel: "in_app", userId: "admin-1" }),
        expect.objectContaining({ channel: "in_app", userId: "empleado-1" }),
      ]),
    );
  });

  it("un fallo real tambien queda registrado, y la campanita (in_app) no depende de eso", async () => {
    const { sendPushToOrg } = await import("../send-to-org");

    queueResult("memberships", ok([{ user_id: "user-1" }]));
    queueResult("push_subscriptions", ok([
      { id: "sub-boom", user_id: "user-1", endpoint: "e1", p256dh: "p1", auth: "a1" },
    ]));
    sendPushNotification.mockRejectedValueOnce(Object.assign(new Error("Provider unavailable"), { statusCode: 500 }));

    const result = await sendPushToOrg("org-1", payload, { source: "test_source" });

    expect(result).toEqual({ sent: 0, expired: 0, failed: 1 });
    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "push", status: "failed", userId: "user-1" }),
        expect.objectContaining({ channel: "in_app", userId: "user-1" }),
      ]),
    );
  });

  it("no toca nada si la organizacion no tiene miembros activos", async () => {
    const { sendPushToOrg } = await import("../send-to-org");

    queueResult("memberships", ok([]));

    const result = await sendPushToOrg("org-1", payload, { source: "test_source" });

    expect(result).toEqual({ sent: 0, expired: 0, failed: 0 });
    expect(fromCalls).not.toContain("push_subscriptions");
    expect(logNotificationsBulk).not.toHaveBeenCalled();
  });

  it("con miembros reales pero ninguno con push activo, igual garantiza in_app a todos", async () => {
    const { sendPushToOrg } = await import("../send-to-org");

    queueResult("memberships", ok([{ user_id: "user-1" }, { user_id: "user-2" }]));
    queueResult("push_subscriptions", ok([]));

    const result = await sendPushToOrg("org-1", payload, { source: "test_source" });

    expect(result).toEqual({ sent: 0, expired: 0, failed: 0 });
    expect(loggedRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "in_app", userId: "user-1" }),
        expect.objectContaining({ channel: "in_app", userId: "user-2" }),
      ]),
    );
  });
});
