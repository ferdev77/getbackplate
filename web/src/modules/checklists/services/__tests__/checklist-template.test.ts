import { describe, it, expect } from "vitest";
import { normalizePriority } from "../checklist-template.service";

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
