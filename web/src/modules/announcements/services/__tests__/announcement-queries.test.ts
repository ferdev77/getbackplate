import { describe, expect, it } from "vitest";

import { announcementRecurrenceByTarget } from "../../queries";

describe("configuracion de recurrencia para editar", () => {
  it("conserva frecuencia, dias y canales del scheduled job", () => {
    expect(announcementRecurrenceByTarget([
      {
        target_id: "av-1",
        recurrence_type: "custom_days",
        custom_days: [1, 5],
        metadata: { channels: ["push", "email"] },
      },
    ])).toEqual({
      "av-1": {
        is_recurring: true,
        recurrence_type: "custom_days",
        custom_days: [1, 5],
        notification_channels: ["push", "email"],
      },
    });
  });
});
