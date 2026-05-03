import { describe, it, expect } from "vitest";
import { hasMissingColumnError } from "../supabase-compat";

describe("hasMissingColumnError", () => {
  it("returns true when error mentions the column", () => {
    expect(
      hasMissingColumnError({ message: 'column "sort_order" of relation "branches" does not exist' }, "sort_order"),
    ).toBe(true);
  });

  it("returns true with case-insensitive matching", () => {
    expect(
      hasMissingColumnError({ message: 'Column SORT_ORDER does not exist' }, "sort_order"),
    ).toBe(true);
  });

  it("returns false when error is unrelated to the column", () => {
    expect(
      hasMissingColumnError({ message: "permission denied for table branches" }, "sort_order"),
    ).toBe(false);
  });

  it("returns false for null error", () => {
    expect(hasMissingColumnError(null, "sort_order")).toBe(false);
  });

  it("returns false for error without message", () => {
    expect(hasMissingColumnError({}, "sort_order")).toBe(false);
  });

  it("returns false when column name is not in error", () => {
    expect(
      hasMissingColumnError({ message: 'column "other_column" does not exist' }, "sort_order"),
    ).toBe(false);
  });
});
