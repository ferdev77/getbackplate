import { describe, it, expect } from "vitest";
import { formatDateForUi, getReminderSendDate, isDateExpired, formatDateTimeForUi } from "../new-employee-modal-helpers";

describe("formatDateForUi", () => {
  it("returns empty string for null", () => {
    expect(formatDateForUi(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateForUi(undefined)).toBe("");
  });

  it("formats a valid ISO date (YYYY-MM-DD) in UTC", () => {
    const result = formatDateForUi("2025-01-15");
    expect(result).toContain("01");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("returns original value for invalid date", () => {
    expect(formatDateForUi("not-a-date")).toBe("not-a-date");
  });
});

describe("getReminderSendDate", () => {
  it("returns null when expiresAt is null", () => {
    expect(getReminderSendDate(null, 15)).toBeNull();
  });

  it("returns null when reminderDays is null", () => {
    expect(getReminderSendDate("2025-12-01", null)).toBeNull();
  });

  it("subtracts 15 days from expiration date", () => {
    expect(getReminderSendDate("2025-12-16", 15)).toBe("2025-12-01");
  });

  it("subtracts 30 days from expiration date", () => {
    expect(getReminderSendDate("2025-12-31", 30)).toBe("2025-12-01");
  });

  it("subtracts 45 days from expiration date", () => {
    expect(getReminderSendDate("2026-01-15", 45)).toBe("2025-12-01");
  });

  it("returns null for invalid date string", () => {
    expect(getReminderSendDate("invalid", 15)).toBeNull();
  });
});

describe("isDateExpired", () => {
  it("returns false for null", () => {
    expect(isDateExpired(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDateExpired(undefined)).toBe(false);
  });

  it("returns false for invalid date", () => {
    expect(isDateExpired("not-a-date")).toBe(false);
  });

  it("returns true for a past date", () => {
    expect(isDateExpired("2000-01-01")).toBe(true);
  });

  it("returns false for a far future date", () => {
    expect(isDateExpired("2099-12-31")).toBe(false);
  });
});

describe("formatDateTimeForUi", () => {
  it("returns empty string for null", () => {
    expect(formatDateTimeForUi(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(formatDateTimeForUi(undefined)).toBe("");
  });

  it("returns original value for invalid datetime", () => {
    expect(formatDateTimeForUi("not-a-date")).toBe("not-a-date");
  });

  it("formats a valid ISO datetime string", () => {
    const result = formatDateTimeForUi("2025-06-15T10:30:00.000Z");
    expect(result).toContain("2025");
    expect(result).toContain("15");
  });
});
