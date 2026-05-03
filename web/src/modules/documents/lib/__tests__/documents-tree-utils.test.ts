import { describe, it, expect } from "vitest";
import { formatDate, formatSize, isPreviewableMime, normalizeSearchText, parseScope, hasAnyScopeValue } from "../documents-tree-utils";

describe("formatSize", () => {
  it("returns dash for null", () => {
    expect(formatSize(null)).toBe("-");
  });

  it("returns dash for 0 bytes", () => {
    expect(formatSize(0)).toBe("-");
  });

  it("formats bytes", () => {
    expect(formatSize(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatSize(2048)).toBe("2 KB");
  });

  it("formats megabytes with one decimal", () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});

describe("isPreviewableMime", () => {
  it("returns false for null", () => {
    expect(isPreviewableMime(null)).toBe(false);
  });

  it("returns true for image types", () => {
    expect(isPreviewableMime("image/jpeg")).toBe(true);
    expect(isPreviewableMime("image/png")).toBe(true);
  });

  it("returns true for application/pdf", () => {
    expect(isPreviewableMime("application/pdf")).toBe(true);
  });

  it("returns true for text types", () => {
    expect(isPreviewableMime("text/plain")).toBe(true);
    expect(isPreviewableMime("text/html")).toBe(true);
  });

  it("returns false for non-previewable types", () => {
    expect(isPreviewableMime("application/zip")).toBe(false);
    expect(isPreviewableMime("application/octet-stream")).toBe(false);
  });
});

describe("normalizeSearchText", () => {
  it("converts to lowercase", () => {
    expect(normalizeSearchText("HELLO")).toBe("hello");
  });

  it("trims whitespace", () => {
    expect(normalizeSearchText("  hello  ")).toBe("hello");
  });

  it("removes accent marks", () => {
    expect(normalizeSearchText("café")).toBe("cafe");
    expect(normalizeSearchText("niño")).toBe("nino");
  });

  it("handles already normalized text", () => {
    expect(normalizeSearchText("hello")).toBe("hello");
  });
});

describe("parseScope", () => {
  it("returns empty arrays for null", () => {
    const result = parseScope(null);
    expect(result.locations).toEqual([]);
    expect(result.departments).toEqual([]);
    expect(result.positions).toEqual([]);
    expect(result.users).toEqual([]);
  });

  it("returns empty arrays for non-object", () => {
    expect(parseScope("string")).toEqual({ locations: [], departments: [], positions: [], users: [] });
  });

  it("parses locations array", () => {
    const result = parseScope({ locations: ["b1", "b2"] });
    expect(result.locations).toEqual(["b1", "b2"]);
  });

  it("parses department_ids as departments", () => {
    const result = parseScope({ department_ids: ["d1"] });
    expect(result.departments).toEqual(["d1"]);
  });

  it("parses position_ids as positions", () => {
    const result = parseScope({ position_ids: ["p1"] });
    expect(result.positions).toEqual(["p1"]);
  });

  it("filters out non-string values from arrays", () => {
    const result = parseScope({ locations: ["b1", 42, null, "b2"] });
    expect(result.locations).toEqual(["b1", "b2"]);
  });
});

describe("hasAnyScopeValue", () => {
  const empty = { locations: [], departments: [], positions: [], users: [] };

  it("returns false for all-empty scope", () => {
    expect(hasAnyScopeValue(empty)).toBe(false);
  });

  it("returns true when locations has values", () => {
    expect(hasAnyScopeValue({ ...empty, locations: ["b1"] })).toBe(true);
  });

  it("returns true when departments has values", () => {
    expect(hasAnyScopeValue({ ...empty, departments: ["d1"] })).toBe(true);
  });

  it("returns true when users has values", () => {
    expect(hasAnyScopeValue({ ...empty, users: ["u1"] })).toBe(true);
  });
});
