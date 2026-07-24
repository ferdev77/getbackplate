import { describe, it, expect } from "vitest";
import { resolveMembershipLandingPath, userMustChangePassword } from "../access";

const membership = (organizationId: string, roleCode: string) => ({
  membershipId: `${organizationId}:${roleCode}`,
  organizationId,
  roleId: roleCode,
  branchId: null,
  roleCode,
  createdAt: "2026-01-01T00:00:00.000Z",
});

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

describe("resolveMembershipLandingPath", () => {
  it("sends a superadmin without an active impersonation to the superadmin dashboard", () => {
    expect(resolveMembershipLandingPath({
      memberships: [],
      isSuperadmin: true,
    })).toBe("/superadmin/dashboard");
  });

  it("uses the role in the preferred organization", () => {
    expect(resolveMembershipLandingPath({
      memberships: [membership("org-1", "company_admin"), membership("org-2", "employee")],
      preferredOrganizationId: "org-2",
      isSuperadmin: false,
    })).toBe("/portal/home");
  });

  it("sends a company administrator to the company dashboard", () => {
    expect(resolveMembershipLandingPath({
      memberships: [membership("org-1", "company_admin")],
      isSuperadmin: false,
    })).toBe("/app/dashboard");
  });

  it("requires selection when a stale tenant cookie cannot choose between organizations", () => {
    expect(resolveMembershipLandingPath({
      memberships: [membership("org-1", "company_admin"), membership("org-2", "employee")],
      preferredOrganizationId: "stale-org",
      isSuperadmin: false,
    })).toBe("/auth/select-organization");
  });

  it("uses login as the terminal fallback when no membership grants access", () => {
    expect(resolveMembershipLandingPath({
      memberships: [],
      isSuperadmin: false,
    })).toMatch(/^\/auth\/login\?error=/);
  });
});
