import { describe, it, expect } from "vitest";
import {
  parseAudienceScope,
  hasScopeFilters,
  isAudienceUserOverride,
  matchesAudienceFilters,
  canSubjectAccessScope,
  enforceLocationPolicy,
  type AudienceScope,
  type ScopeSubject,
} from "../scope-policy";

const emptyScope: AudienceScope = {
  locations: [],
  department_ids: [],
  position_ids: [],
  users: [],
};

const basicSubject: ScopeSubject = {
  userId: "u1",
  locationId: "loc1",
  departmentId: "dept1",
  positionIds: ["pos1"],
};

// ─────────────────────────────────────────────────────────────────────────────
describe("parseAudienceScope", () => {
  it("returns empty scope for null", () => {
    expect(parseAudienceScope(null)).toEqual(emptyScope);
  });

  it("returns empty scope for undefined", () => {
    expect(parseAudienceScope(undefined)).toEqual(emptyScope);
  });

  it("returns empty scope for a string", () => {
    expect(parseAudienceScope("string")).toEqual(emptyScope);
  });

  it("returns empty scope for a number", () => {
    expect(parseAudienceScope(42)).toEqual(emptyScope);
  });

  it("parses a complete valid scope object", () => {
    const result = parseAudienceScope({
      locations: ["loc1", "loc2"],
      department_ids: ["dept1"],
      position_ids: ["pos1"],
      users: ["u1"],
    });
    expect(result.locations).toEqual(["loc1", "loc2"]);
    expect(result.department_ids).toEqual(["dept1"]);
    expect(result.position_ids).toEqual(["pos1"]);
    expect(result.users).toEqual(["u1"]);
  });

  it("returns empty arrays for non-array list values", () => {
    const result = parseAudienceScope({ locations: "not-array", department_ids: null });
    expect(result.locations).toEqual([]);
    expect(result.department_ids).toEqual([]);
  });

  it("deduplicates values", () => {
    const result = parseAudienceScope({ locations: ["loc1", "loc1", "loc2"] });
    expect(result.locations).toEqual(["loc1", "loc2"]);
  });

  it("trims whitespace from values", () => {
    const result = parseAudienceScope({ locations: ["  loc1  ", " loc2"] });
    expect(result.locations).toEqual(["loc1", "loc2"]);
  });

  it("filters out empty strings", () => {
    const result = parseAudienceScope({ locations: ["loc1", "", "  "] });
    expect(result.locations).toEqual(["loc1"]);
  });

  it("filters out non-string array items", () => {
    const result = parseAudienceScope({ locations: ["loc1", 42, null, true] });
    expect(result.locations).toEqual(["loc1"]);
  });

  it("handles empty object returning all empty lists", () => {
    expect(parseAudienceScope({})).toEqual(emptyScope);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("hasScopeFilters", () => {
  it("returns false for fully empty scope", () => {
    expect(hasScopeFilters(emptyScope)).toBe(false);
  });

  it("returns true when locations is set", () => {
    expect(hasScopeFilters({ ...emptyScope, locations: ["loc1"] })).toBe(true);
  });

  it("returns true when department_ids is set", () => {
    expect(hasScopeFilters({ ...emptyScope, department_ids: ["dept1"] })).toBe(true);
  });

  it("returns true when position_ids is set", () => {
    expect(hasScopeFilters({ ...emptyScope, position_ids: ["pos1"] })).toBe(true);
  });

  it("returns false when only users is set (users is not a filter, it's an override)", () => {
    expect(hasScopeFilters({ ...emptyScope, users: ["u1"] })).toBe(false);
  });

  it("returns true when multiple filters are set", () => {
    expect(
      hasScopeFilters({ locations: ["loc1"], department_ids: ["dept1"], position_ids: [], users: [] }),
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("isAudienceUserOverride", () => {
  it("returns true when subject userId is in scope.users", () => {
    const scope = { ...emptyScope, users: ["u1", "u2"] };
    expect(isAudienceUserOverride(scope, { ...basicSubject, userId: "u1" })).toBe(true);
  });

  it("returns true for the second user in the list", () => {
    const scope = { ...emptyScope, users: ["u1", "u2"] };
    expect(isAudienceUserOverride(scope, { ...basicSubject, userId: "u2" })).toBe(true);
  });

  it("returns false when subject userId is not in scope.users", () => {
    const scope = { ...emptyScope, users: ["u2", "u3"] };
    expect(isAudienceUserOverride(scope, basicSubject)).toBe(false);
  });

  it("returns false when scope.users is empty", () => {
    expect(isAudienceUserOverride(emptyScope, basicSubject)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("matchesAudienceFilters", () => {
  it("returns true when no filters are active (broadcast)", () => {
    expect(matchesAudienceFilters(emptyScope, basicSubject)).toBe(true);
  });

  it("returns true when subject matches all active filters", () => {
    const scope: AudienceScope = {
      locations: ["loc1"],
      department_ids: ["dept1"],
      position_ids: ["pos1"],
      users: [],
    };
    expect(matchesAudienceFilters(scope, basicSubject)).toBe(true);
  });

  it("returns false when location does not match", () => {
    const scope = { ...emptyScope, locations: ["loc2"] };
    expect(matchesAudienceFilters(scope, basicSubject)).toBe(false);
  });

  it("returns false when department does not match", () => {
    const scope = { ...emptyScope, department_ids: ["dept2"] };
    expect(matchesAudienceFilters(scope, basicSubject)).toBe(false);
  });

  it("returns false when position does not match", () => {
    const scope = { ...emptyScope, position_ids: ["pos2"] };
    expect(matchesAudienceFilters(scope, { ...basicSubject, positionIds: ["pos1"] })).toBe(false);
  });

  it("returns true when subject has no location and no location filter is active", () => {
    const scope = { ...emptyScope, department_ids: ["dept1"] };
    expect(matchesAudienceFilters(scope, { ...basicSubject, locationId: null })).toBe(true);
  });

  it("returns false when subject has no location but a location filter is required", () => {
    const scope = { ...emptyScope, locations: ["loc1"] };
    expect(matchesAudienceFilters(scope, { ...basicSubject, locationId: null })).toBe(false);
  });

  it("returns false when positionIds is empty and scope requires a position", () => {
    const scope = { ...emptyScope, position_ids: ["pos1"] };
    expect(matchesAudienceFilters(scope, { ...basicSubject, positionIds: [] })).toBe(false);
  });

  it("returns false when positionIds is undefined and scope requires a position", () => {
    const scope = { ...emptyScope, position_ids: ["pos1"] };
    const subject: ScopeSubject = { userId: "u1", locationId: "loc1", departmentId: "dept1" };
    expect(matchesAudienceFilters(scope, subject)).toBe(false);
  });

  it("returns true when subject has multiple positions and one matches", () => {
    const scope = { ...emptyScope, position_ids: ["pos2"] };
    expect(
      matchesAudienceFilters(scope, { ...basicSubject, positionIds: ["pos1", "pos2"] }),
    ).toBe(true);
  });

  it("returns true when only location filter is active and matches", () => {
    const scope = { ...emptyScope, locations: ["loc1"] };
    expect(matchesAudienceFilters(scope, basicSubject)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("canSubjectAccessScope", () => {
  it("returns true for broadcast (empty scope object)", () => {
    expect(canSubjectAccessScope({}, basicSubject)).toBe(true);
  });

  it("returns true for null scope (treated as broadcast)", () => {
    expect(canSubjectAccessScope(null, basicSubject)).toBe(true);
  });

  it("returns true when subject is in users list, ignoring filter mismatches", () => {
    const scope = {
      locations: ["other-loc"],
      department_ids: [],
      position_ids: [],
      users: ["u1"],
    };
    expect(canSubjectAccessScope(scope, basicSubject)).toBe(true);
  });

  it("returns false when not in users and filters do not match", () => {
    const scope = {
      locations: ["loc2"],
      department_ids: [],
      position_ids: [],
      users: [],
    };
    expect(canSubjectAccessScope(scope, basicSubject)).toBe(false);
  });

  it("returns true when filters match and subject is not in users", () => {
    const scope = {
      locations: ["loc1"],
      department_ids: [],
      position_ids: [],
      users: [],
    };
    expect(canSubjectAccessScope(scope, basicSubject)).toBe(true);
  });

  it("handles raw unparsed scope object (arrays with duplicates / whitespace)", () => {
    const rawScope = {
      locations: ["  loc1  ", "loc1"],
      department_ids: [],
      position_ids: [],
      users: [],
    };
    expect(canSubjectAccessScope(rawScope, basicSubject)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("enforceLocationPolicy", () => {
  it("returns ok with requested locations when all are allowed", () => {
    const result = enforceLocationPolicy({
      requestedLocations: ["loc1", "loc2"],
      allowedLocations: ["loc1", "loc2", "loc3"],
      fallbackToAllowedWhenEmpty: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.locations).toEqual(["loc1", "loc2"]);
  });

  it("returns error with invalidLocations when requesting a non-allowed location", () => {
    const result = enforceLocationPolicy({
      requestedLocations: ["loc1", "loc-evil"],
      allowedLocations: ["loc1"],
      fallbackToAllowedWhenEmpty: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.invalidLocations).toContain("loc-evil");
  });

  it("falls back to allowedLocations when requestedLocations is empty and fallback is true", () => {
    const result = enforceLocationPolicy({
      requestedLocations: [],
      allowedLocations: ["loc1", "loc2"],
      fallbackToAllowedWhenEmpty: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.locations).toEqual(["loc1", "loc2"]);
  });

  it("returns empty locations when requestedLocations is empty and fallback is false", () => {
    const result = enforceLocationPolicy({
      requestedLocations: [],
      allowedLocations: ["loc1", "loc2"],
      fallbackToAllowedWhenEmpty: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.locations).toEqual([]);
  });

  it("deduplicates requested locations", () => {
    const result = enforceLocationPolicy({
      requestedLocations: ["loc1", "loc1", "loc2"],
      allowedLocations: ["loc1", "loc2"],
      fallbackToAllowedWhenEmpty: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.locations).toEqual(["loc1", "loc2"]);
  });

  it("trims whitespace from requested locations before validating", () => {
    const result = enforceLocationPolicy({
      requestedLocations: ["  loc1  "],
      allowedLocations: ["loc1"],
      fallbackToAllowedWhenEmpty: false,
    });
    expect(result.ok).toBe(true);
  });

  it("reports all invalid locations (not just the first)", () => {
    const result = enforceLocationPolicy({
      requestedLocations: ["loc-a", "loc-b", "loc1"],
      allowedLocations: ["loc1"],
      fallbackToAllowedWhenEmpty: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.invalidLocations).toContain("loc-a");
      expect(result.invalidLocations).toContain("loc-b");
      expect(result.invalidLocations).not.toContain("loc1");
    }
  });
});
