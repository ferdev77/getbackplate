import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockResult = { data: unknown; error: unknown };

function makeChainable(result: MockResult) {
  const chain: Record<string, unknown> = {
    eq: () => chain,
    in: () => chain,
    is: () => chain,
    limit: () => chain,
    order: () => chain,
    select: () => chain,
    update: () => chain,
    insert: () => chain,
    upsert: () => chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
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

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

const logAuditEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/shared/lib/audit", () => ({
  logAuditEvent: (...args: unknown[]) => logAuditEvent(...args),
}));

vi.mock("@/shared/lib/app-url", () => ({
  getCanonicalAppUrl: () => "https://app.getbackplate.com",
}));

const CONNECTION_ROW = {
  id: "connection-1",
  organization_id: "org-prodel",
  provider: "quickbooks_online",
  status: "connected",
  config: {},
  secrets_ciphertext: "cipher",
  secrets_iv: "iv",
  secrets_tag: "tag",
  realm_id_hash: "hash",
  connected_at: null,
  last_error: null,
  updated_at: "2026-07-21T00:00:00.000Z",
};

function baseEvent(overrides: Partial<{
  signatureValid: boolean;
  intuitEventId: string | null;
  realmId: string;
  entity: string;
  entityId: string;
  operation: string;
  lastUpdatedAt: string | null;
}> = {}) {
  return {
    signatureValid: true,
    intuitEventId: "cloud-event-1",
    realmId: "9341456936461178",
    entity: "Invoice",
    entityId: "150",
    operation: "Emailed",
    lastUpdatedAt: "2026-07-21T10:48:56Z",
    rawPayload: {},
    rawNotification: {},
    rawHeaders: {},
    ...overrides,
  };
}

describe("insertQboWebhookEvents", () => {
  beforeEach(() => {
    tableQueues.clear();
    fromCalls.length = 0;
    logAuditEvent.mockClear();
    vi.stubEnv("INTEGRATIONS_ENCRYPTION_KEY", "test-only-encryption-key");
    vi.stubEnv("CRON_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("un Invoice Emailed con firma valida y org resuelta dispara el pipeline unificado", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok(null)); // dedupe pre-check: no existe
    queueResult("integration_connections", ok(CONNECTION_ROW)); // resolver organizationId por realm
    queueResult("qbo_webhook_events", ok({ id: "webhook-event-1" })); // insert
    queueResult("qbo_unified_invoices", ok(null)); // upsert a la cola unificada

    const result = await insertQboWebhookEvents([baseEvent()]);

    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(fromCalls).toContain("qbo_unified_invoices");
  });

  it("un CreditMemo Emailed tambien dispara el pipeline (mismo criterio que Invoice)", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok(null));
    queueResult("integration_connections", ok(CONNECTION_ROW));
    queueResult("qbo_webhook_events", ok({ id: "webhook-event-2" }));
    queueResult("qbo_unified_invoices", ok(null));

    const result = await insertQboWebhookEvents([baseEvent({ entity: "CreditMemo", entityId: "credit-1" })]);

    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(fromCalls).toContain("qbo_unified_invoices");
  });

  it("un Invoice Created (no Emailed) se captura pero NO dispara el pipeline automatico", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok(null));
    queueResult("integration_connections", ok(CONNECTION_ROW));
    queueResult("qbo_webhook_events", ok({ id: "webhook-event-3" }));

    const result = await insertQboWebhookEvents([baseEvent({ operation: "Create" })]);

    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(fromCalls).not.toContain("qbo_unified_invoices");
  });

  it("firma invalida: se captura como failed, sin resolver organizacion y sin disparar el pipeline", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok({ id: "webhook-event-4" })); // insert (no dedupe: sin intuitEventId en este caso da igual)

    const result = await insertQboWebhookEvents([baseEvent({ signatureValid: false, intuitEventId: null })]);

    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(fromCalls).not.toContain("integration_connections");
    expect(fromCalls).not.toContain("qbo_unified_invoices");
  });

  it("un evento repetido (mismo intuit_event_id) se cuenta como duplicado y no vuelve a insertar", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok({ id: "already-there" })); // dedupe pre-check: ya existe

    const result = await insertQboWebhookEvents([baseEvent()]);

    expect(result).toEqual({ inserted: 0, duplicates: 1 });
    expect(fromCalls.filter((t) => t === "qbo_webhook_events")).toHaveLength(1);
  });

  it("colision en el indice unico de la base (23505) tambien se cuenta como duplicado", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok(null)); // dedupe pre-check: no la encuentra
    queueResult("integration_connections", ok(CONNECTION_ROW));
    queueResult("qbo_webhook_events", { data: null, error: { code: "23505", message: "duplicate key" } }); // insert choca

    const result = await insertQboWebhookEvents([baseEvent()]);

    expect(result).toEqual({ inserted: 0, duplicates: 1 });
  });

  it("realm sin organizacion vinculada: se captura con organization_id null y no dispara el pipeline", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    queueResult("qbo_webhook_events", ok(null));
    queueResult("integration_connections", ok(null)); // no hay conexion para ese realm
    queueResult("integration_connections", ok([])); // fallback de conexiones sin realm_id_hash: ninguna
    queueResult("qbo_webhook_events", ok({ id: "webhook-event-5" }));

    const result = await insertQboWebhookEvents([baseEvent({ realmId: "realm-desconocido" })]);

    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(fromCalls).not.toContain("qbo_unified_invoices");
  });

  it("captures an undocumented AppDisconnect event without changing authorization state", async () => {
    const { insertQboWebhookEvents } = await import("../service");

    const appDisconnectEvent = baseEvent({
      entity: "AppDisconnect",
      entityId: "9341456936461178",
      operation: "Delete",
      intuitEventId: "disconnect-1",
    });

    queueResult("qbo_webhook_events", ok(null)); // dedupe pre-check
    queueResult("integration_connections", ok(CONNECTION_ROW));
    queueResult("qbo_webhook_events", ok({ id: "webhook-event-6" })); // insert del evento crudo

    const result = await insertQboWebhookEvents([appDisconnectEvent]);

    expect(result).toEqual({ inserted: 1, duplicates: 0 });
    expect(logAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      action: "integration.qbo_r365.qbo.disconnected",
    }));
  });
});
