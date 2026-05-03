import { describe, it, expect } from "vitest";
import { toCode } from "../org-structure.service";

describe("toCode", () => {
  it("converts to lowercase", () => {
    expect(toCode("HELLO")).toBe("hello");
  });

  it("replaces spaces with hyphens", () => {
    expect(toCode("Mi Rama")).toBe("mi-rama");
  });

  it("replaces multiple consecutive special chars with single hyphen", () => {
    expect(toCode("hello   world")).toBe("hello-world");
  });

  it("removes leading and trailing hyphens", () => {
    expect(toCode("-hello-")).toBe("hello");
  });

  it("replaces non-alphanumeric chars", () => {
    expect(toCode("hello@world!")).toBe("hello-world");
  });

  it("truncates to 60 characters", () => {
    const long = "a".repeat(80);
    expect(toCode(long)).toHaveLength(60);
  });

  it("handles already valid code", () => {
    expect(toCode("kitchen")).toBe("kitchen");
  });

  it("handles empty string", () => {
    expect(toCode("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(toCode("---!!!---")).toBe("");
  });
});
