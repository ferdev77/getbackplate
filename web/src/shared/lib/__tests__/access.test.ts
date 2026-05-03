import { describe, it, expect } from "vitest";
import { userMustChangePassword } from "../access";

describe("userMustChangePassword", () => {
  it("returns false for null user", () => {
    expect(userMustChangePassword(null)).toBe(false);
  });

  it("returns false for undefined user", () => {
    expect(userMustChangePassword(undefined)).toBe(false);
  });

  it("returns false when user_metadata is missing", () => {
    expect(userMustChangePassword({})).toBe(false);
  });

  it("returns false when user_metadata is not an object", () => {
    expect(userMustChangePassword({ user_metadata: "string" })).toBe(false);
  });

  it("returns false when force_password_change is false", () => {
    expect(userMustChangePassword({ user_metadata: { force_password_change: false } })).toBe(false);
  });

  it("returns false when force_password_change is absent", () => {
    expect(userMustChangePassword({ user_metadata: { other_field: true } })).toBe(false);
  });

  it("returns true when force_password_change is true", () => {
    expect(userMustChangePassword({ user_metadata: { force_password_change: true } })).toBe(true);
  });

  it("returns true when force_password_change is truthy (1)", () => {
    expect(userMustChangePassword({ user_metadata: { force_password_change: 1 } })).toBe(true);
  });
});
