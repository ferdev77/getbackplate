import { describe, it, expect } from "vitest";
import { decideChecklistSectionUpdate, normalizePriority } from "../checklist-template.service";

describe("normalizePriority", () => {
  it("accepts low", () => {
    expect(normalizePriority("low")).toBe("low");
  });

  it("accepts medium", () => {
    expect(normalizePriority("medium")).toBe("medium");
  });

  it("accepts high", () => {
    expect(normalizePriority("high")).toBe("high");
  });

  it("normalizes uppercase", () => {
    expect(normalizePriority("HIGH")).toBe("high");
    expect(normalizePriority("LOW")).toBe("low");
  });

  it("trims whitespace before comparing", () => {
    expect(normalizePriority("  high  ")).toBe("high");
  });

  it("defaults to medium for unknown values", () => {
    expect(normalizePriority("urgent")).toBe("medium");
    expect(normalizePriority("")).toBe("medium");
    expect(normalizePriority("critical")).toBe("medium");
  });
});

describe("decideChecklistSectionUpdate", () => {
  it("defers a structural edit when the current cycle has responses and a future run", () => {
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 2,
      recurrenceType: "daily",
      isActive: true,
    })).toBe("defer");
  });

  it("rejects a structural edit when there is no future cycle", () => {
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 1,
      recurrenceType: "none",
      isActive: true,
    })).toBe("reject");
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 1,
      recurrenceType: "daily",
      isActive: false,
    })).toBe("reject");
  });

  it("applies text edits and structural edits without current responses immediately", () => {
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: true,
      responsesInCurrentCycle: 3,
      recurrenceType: "daily",
      isActive: true,
    })).toBe("immediate");
    expect(decideChecklistSectionUpdate({
      isEdit: true,
      onlyTextEdits: false,
      responsesInCurrentCycle: 0,
      recurrenceType: "daily",
      isActive: true,
    })).toBe("immediate");
  });
});
