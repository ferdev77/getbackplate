import { describe, expect, it } from "vitest";

import { parseQboWebhookEnvelope, parseQboWebhookPayload } from "../qbo-webhook-payload";

describe("parseQboWebhookPayload", () => {
  it("preserves the current legacy Emailed event mapping", () => {
    const notification = {
      realmId: "realm-1",
      dataChangeEvent: {
        id: "legacy-event-1",
        entities: [{
          name: "Invoice",
          id: "invoice-1",
          operation: "Emailed",
          lastUpdated: "2026-07-20T13:52:12.919Z",
        }],
      },
    };

    expect(parseQboWebhookPayload({ eventNotifications: [notification] })).toEqual([{
      intuitEventId: "legacy-event-1",
      realmId: "realm-1",
      entity: "Invoice",
      entityId: "invoice-1",
      operation: "Emailed",
      lastUpdatedAt: "2026-07-20T13:52:12.919Z",
      rawPayload: notification.dataChangeEvent.entities[0],
      rawNotification: notification,
    }]);
  });

  it("normalizes CloudEvents for multiple QuickBooks companies", () => {
    const payload = [
      {
        specversion: "1.0",
        id: "cloud-event-1",
        source: "intuit.source",
        type: "qbo.invoice.emailed.v1",
        time: "2026-07-21T10:00:00Z",
        intuitentityid: "invoice-1",
        intuitaccountid: "realm-1",
        data: {},
      },
      {
        specversion: "1.0",
        id: "cloud-event-2",
        source: "intuit.source",
        type: "qbo.creditmemo.emailed.v1",
        time: "2026-07-21T10:01:00Z",
        intuitentityid: "credit-1",
        intuitaccountid: "realm-2",
        data: {},
      },
    ];

    const result = parseQboWebhookPayload(payload);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(expect.objectContaining({
      intuitEventId: "cloud-event-1",
      realmId: "realm-1",
      entity: "Invoice",
      entityId: "invoice-1",
      operation: "Emailed",
      lastUpdatedAt: "2026-07-21T10:00:00Z",
    }));
    expect(result[1]).toEqual(expect.objectContaining({
      intuitEventId: "cloud-event-2",
      realmId: "realm-2",
      entity: "CreditMemo",
      entityId: "credit-1",
      operation: "Emailed",
    }));
  });

  it("keeps CloudEvents data as the raw entity payload", () => {
    const data = { Id: "invoice-1", DocNumber: "INV-100" };
    const [event] = parseQboWebhookPayload([{
      specversion: "1.0",
      id: "cloud-event-1",
      type: "qbo.invoice.created.v1",
      intuitentityid: "invoice-1",
      intuitaccountid: "realm-1",
      data,
    }]);

    expect(event.rawPayload).toBe(data);
    expect(event.operation).toBe("Create");
  });

  it("does not manufacture identifiers for undocumented AppDisconnect events", () => {
    const events = parseQboWebhookPayload([{
      specversion: "1.0",
      id: "disconnect-1",
      type: "qbo.appdisconnect.deleted.v1",
      time: "2026-07-21T11:00:00Z",
      intuitaccountid: "realm-1",
    }]);

    expect(events).toEqual([]);
  });

  it("ignores malformed or unsupported payload entries", () => {
    expect(parseQboWebhookPayload(null)).toEqual([]);
    expect(parseQboWebhookPayload({ unexpected: true })).toEqual([]);
    expect(parseQboWebhookPayload([
      { specversion: "0.3", type: "qbo.invoice.emailed.v1" },
      { specversion: "1.0", type: "not-a-qbo-event" },
      { specversion: "1.0", type: "qbo.invoice.emailed.v1", intuitaccountid: "realm-1" },
    ])).toEqual([]);
  });

  it("reports unsupported envelopes and partial CloudEvent batches", () => {
    expect(parseQboWebhookEnvelope({ unexpected: true })).toMatchObject({
      format: "unsupported",
      events: [],
      ignoredEntries: 1,
    });

    const result = parseQboWebhookEnvelope([
      {
        specversion: "1.0",
        id: "event-1",
        type: "qbo.invoice.emailed.v1",
        intuitentityid: "invoice-1",
        intuitaccountid: "realm-1",
      },
      { specversion: "0.3", type: "qbo.invoice.emailed.v1" },
    ]);
    expect(result.format).toBe("cloudevents");
    expect(result.events).toHaveLength(1);
    expect(result.ignoredEntries).toBe(1);
  });

  it("ignores malformed entries inside a legacy batch without rejecting valid events", () => {
    const validNotification = {
      realmId: "realm-1",
      dataChangeEvent: {
        entities: [null, {
          name: "Invoice",
          id: "invoice-1",
          operation: "Emailed",
        }],
      },
    };

    expect(parseQboWebhookPayload({
      eventNotifications: [null, { realmId: "realm-1", dataChangeEvent: null }, validNotification],
    })).toEqual([expect.objectContaining({
      realmId: "realm-1",
      entity: "Invoice",
      entityId: "invoice-1",
      operation: "Emailed",
    })]);
  });
});
