import { describe, expect, it } from "vitest";
import { shouldApplyQboAppDisconnect } from "../lifecycle";

describe("shouldApplyQboAppDisconnect", () => {
  it("accepts a disconnect for the current authorization", () => {
    expect(shouldApplyQboAppDisconnect(
      "2026-07-19T10:00:00.000Z",
      "2026-07-19T10:05:00.000Z",
    )).toBe(true);
  });

  it("rejects a delayed event from before a reconnection", () => {
    expect(shouldApplyQboAppDisconnect(
      "2026-07-19T10:05:00.000Z",
      "2026-07-19T10:00:00.000Z",
    )).toBe(false);
  });

  it("rejects an event timestamped before a reconnection", () => {
    expect(shouldApplyQboAppDisconnect(
      "2026-07-19T10:00:30.000Z",
      "2026-07-19T10:00:00.000Z",
    )).toBe(false);
  });

  it("rejects missing or invalid event timestamps", () => {
    expect(shouldApplyQboAppDisconnect(null, null)).toBe(false);
    expect(shouldApplyQboAppDisconnect(null, "invalid")).toBe(false);
  });
});
