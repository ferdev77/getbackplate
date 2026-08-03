import { describe, expect, it } from "vitest";

import { normalizeChecklistNotificationChannels } from "./notification-channels";

describe("normalizeChecklistNotificationChannels", () => {
  it("reads the canonical channel array", () => {
    expect(normalizeChecklistNotificationChannels({ notify_channels: ["email", "sms"] })).toEqual(["email", "sms"]);
  });

  it("supports legacy arrays and scalar values", () => {
    expect(normalizeChecklistNotificationChannels({ notify_via: ["sms"] })).toEqual(["sms"]);
    expect(normalizeChecklistNotificationChannels({ notify_via: "email" })).toEqual(["email"]);
    expect(normalizeChecklistNotificationChannels({ notify_via: "all" })).toEqual(["email", "sms"]);
  });

  it("lets an explicit canonical empty array override legacy data", () => {
    expect(normalizeChecklistNotificationChannels({ notify_channels: [], notify_via: "all" })).toEqual([]);
  });

  it("ignores removed or unknown channels", () => {
    expect(normalizeChecklistNotificationChannels({ notify_via: ["whatsapp", "carrier-pigeon"] })).toEqual([]);
  });
});
