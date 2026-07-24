export type NormalizedQboWebhookEvent = {
  intuitEventId: string | null;
  realmId: string;
  entity: string;
  entityId: string;
  operation: string;
  lastUpdatedAt: string | null;
  rawPayload: Record<string, unknown>;
  rawNotification: Record<string, unknown>;
};

type LegacyWebhookPayload = {
  eventNotifications?: Array<{
    realmId?: string;
    dataChangeEvent?: {
      id?: string;
      entities?: Array<{
        name?: string;
        id?: string;
        operation?: string;
        lastUpdated?: string;
      }>;
    };
  }>;
};

type QboCloudEvent = {
  specversion?: string;
  id?: string;
  type?: string;
  time?: string;
  intuitentityid?: string;
  intuitaccountid?: string;
  data?: unknown;
};

const ENTITY_NAMES: Record<string, string> = {
  appdisconnect: "AppDisconnect",
  creditmemo: "CreditMemo",
  invoice: "Invoice",
  salesreceipt: "SalesReceipt",
};

const OPERATION_NAMES: Record<string, string> = {
  created: "Create",
  deleted: "Delete",
  emailed: "Emailed",
  merged: "Merge",
  updated: "Update",
  voided: "Void",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function capitalize(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : "";
}

function parseCloudEventType(value: string) {
  const match = /^qbo\.([a-z][a-z0-9_-]*)\.([a-z][a-z0-9_-]*)\.v\d+$/i.exec(value.trim());
  if (!match) return null;

  const entityKey = match[1].toLowerCase().replaceAll("_", "").replaceAll("-", "");
  const operationKey = match[2].toLowerCase();
  return {
    entity: ENTITY_NAMES[entityKey] ?? capitalize(match[1]),
    operation: OPERATION_NAMES[operationKey] ?? capitalize(match[2]),
  };
}

function parseLegacyPayload(payload: LegacyWebhookPayload): NormalizedQboWebhookEvent[] {
  return (payload.eventNotifications ?? []).flatMap((candidate) => {
    const notification = asRecord(candidate);
    if (!notification) return [];

    const realmId = String(notification.realmId ?? "").trim();
    const dataChangeEvent = asRecord(notification.dataChangeEvent);
    const intuitEventId = typeof dataChangeEvent?.id === "string"
      ? dataChangeEvent.id
      : null;
    if (!realmId) return [];

    const entities = Array.isArray(dataChangeEvent?.entities) ? dataChangeEvent.entities : [];
    return entities
      .flatMap((candidateEntity): NormalizedQboWebhookEvent[] => {
        const entity = asRecord(candidateEntity);
        if (!entity) return [];

        const entityName = String(entity.name ?? "").trim();
        const event = {
          intuitEventId,
          realmId,
          entity: entityName,
          entityId: String(entity.id ?? "").trim(),
          operation: String(entity.operation ?? "").trim(),
          lastUpdatedAt: entity.lastUpdated ? String(entity.lastUpdated) : null,
          rawPayload: entity as Record<string, unknown>,
          rawNotification: notification as Record<string, unknown>,
        };
        return event.entity && event.entityId && event.operation ? [event] : [];
      });
  });
}

function parseCloudEvents(payload: unknown[]): NormalizedQboWebhookEvent[] {
  return payload.flatMap((candidate) => {
    const rawEvent = asRecord(candidate);
    if (!rawEvent) return [];

    const event = rawEvent as QboCloudEvent;
    if (event.specversion !== "1.0" || typeof event.type !== "string") return [];
    const parsedType = parseCloudEventType(event.type);
    if (!parsedType) return [];

    const realmId = String(event.intuitaccountid ?? "").trim();
    const entityId = String(event.intuitentityid ?? "").trim();
    if (!realmId || !entityId) return [];

    return [{
      intuitEventId: typeof event.id === "string" && event.id.trim() ? event.id.trim() : null,
      realmId,
      entity: parsedType.entity,
      entityId,
      operation: parsedType.operation,
      lastUpdatedAt: typeof event.time === "string" && event.time.trim() ? event.time : null,
      rawPayload: asRecord(event.data) ?? rawEvent,
      rawNotification: rawEvent,
    }];
  });
}

export function parseQboWebhookPayload(payload: unknown): NormalizedQboWebhookEvent[] {
  if (Array.isArray(payload)) return parseCloudEvents(payload);

  const record = asRecord(payload);
  if (!record || !Array.isArray(record.eventNotifications)) return [];
  return parseLegacyPayload(record as LegacyWebhookPayload);
}

export function parseQboWebhookEnvelope(payload: unknown): {
  format: "legacy" | "cloudevents" | "unsupported";
  events: NormalizedQboWebhookEvent[];
  ignoredEntries: number;
  reasons: string[];
} {
  if (Array.isArray(payload)) {
    const events = parseCloudEvents(payload);
    const ignoredEntries = Math.max(0, payload.length - events.length);
    return {
      format: "cloudevents",
      events,
      ignoredEntries,
      reasons: ignoredEntries ? ["unsupported_or_incomplete_cloudevent"] : [],
    };
  }

  const record = asRecord(payload);
  if (record && Array.isArray(record.eventNotifications)) {
    const events = parseLegacyPayload(record as LegacyWebhookPayload);
    const candidateCount = record.eventNotifications.reduce((count, notification) => {
      const candidate = asRecord(notification);
      const dataChangeEvent = asRecord(candidate?.dataChangeEvent);
      return count + (Array.isArray(dataChangeEvent?.entities) ? dataChangeEvent.entities.length : 0);
    }, 0);
    const ignoredEntries = Math.max(0, candidateCount - events.length);
    return {
      format: "legacy",
      events,
      ignoredEntries,
      reasons: ignoredEntries ? ["unsupported_or_incomplete_legacy_event"] : [],
    };
  }

  return {
    format: "unsupported",
    events: [],
    ignoredEntries: 1,
    reasons: ["unsupported_top_level_shape"],
  };
}
