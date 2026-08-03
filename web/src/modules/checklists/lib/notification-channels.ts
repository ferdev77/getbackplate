export type ChecklistNotificationChannel = "email" | "sms";

const CHANNELS = new Set<ChecklistNotificationChannel>(["email", "sms"]);

function readChannels(value: unknown): ChecklistNotificationChannel[] {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const result = new Set<ChecklistNotificationChannel>();

  for (const raw of values) {
    const channel = String(raw).trim().toLowerCase();
    if (channel === "all") {
      result.add("email");
      result.add("sms");
    } else if (CHANNELS.has(channel as ChecklistNotificationChannel)) {
      result.add(channel as ChecklistNotificationChannel);
    }
  }

  return [...result];
}

export function normalizeChecklistNotificationChannels(
  targetScope: unknown,
): ChecklistNotificationChannel[] {
  if (!targetScope || typeof targetScope !== "object") return [];
  const scope = targetScope as Record<string, unknown>;

  // An explicitly persisted canonical value, including [], always wins.
  if (Object.prototype.hasOwnProperty.call(scope, "notify_channels")) {
    return readChannels(scope.notify_channels);
  }

  return readChannels(scope.notify_via);
}
