import { describe, expect, it } from "vitest";

import { normalizeChecklistNotificationChannels } from "./notification-channels";

describe("normalizeChecklistNotificationChannels", () => {
  it("reads the canonical channel array", () => {
    expect(normalizeChecklistNotificationChannels({ notify_channels: ["email"] })).toEqual(["email"]);
  });

  it("supports legacy arrays and scalar values", () => {
    expect(normalizeChecklistNotificationChannels({ notify_via: "email" })).toEqual(["email"]);
    expect(normalizeChecklistNotificationChannels({ notify_via: ["email"] })).toEqual(["email"]);
  });

  it("lets an explicit canonical empty array override legacy data", () => {
    expect(normalizeChecklistNotificationChannels({ notify_channels: [], notify_via: "all" })).toEqual([]);
  });

  it("ignores removed or unknown channels", () => {
    expect(normalizeChecklistNotificationChannels({ notify_via: ["whatsapp", "carrier-pigeon"] })).toEqual([]);
  });

  // --- SMS discontinuado -----------------------------------------------------
  // Estos casos son el contrato del corte: hay checklists en produccion con
  // "sms" y con "all" guardados de antes, y tienen que dejar de mandar SMS sin
  // migrar la base. Si alguno de estos falla, se reactivo el canal.

  it("descarta 'sms' aunque este guardado en el registro", () => {
    expect(normalizeChecklistNotificationChannels({ notify_channels: ["email", "sms"] })).toEqual(["email"]);
    expect(normalizeChecklistNotificationChannels({ notify_via: ["sms"] })).toEqual([]);
  });

  it("el legacy 'all' ya no incluye sms, solo email", () => {
    expect(normalizeChecklistNotificationChannels({ notify_via: "all" })).toEqual(["email"]);
  });
});
