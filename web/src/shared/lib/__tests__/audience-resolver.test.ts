import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveAudienceContacts, type AudienceScope } from "../audience-resolver";

// Mock the auth-users module since it calls Supabase
vi.mock("../auth-users", () => ({
  getAuthEmailByUserId: vi.fn(async (ids: string[]) => {
    const map = new Map<string, string>();
    for (const id of ids) {
      map.set(id, `${id}@test.com`);
    }
    return map;
  }),
}));

function buildSupabaseMock(overrides: {
  employees?: object[];
  positions?: object[];
  memberships?: object[];
  profiles?: object[];
}) {
  const { employees = [], positions = [], memberships = [], profiles = [] } = overrides;

  const tableMap: Record<string, object[]> = {
    employees,
    department_positions: positions,
    memberships,
    organization_user_profiles: profiles,
  };

  const chainMock = (data: object[]) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      not: () => chain,
      data,
      error: null,
    };
    return chain;
  };

  return {
    from: (table: string) => chainMock(tableMap[table] ?? []),
  };
}

const emptyScope: AudienceScope = { locations: [], department_ids: [], position_ids: [], users: [] };

describe("resolveAudienceContacts", () => {
  describe("no scope (broadcast)", () => {
    it("returns all members when scope is empty and no templateBranchId", async () => {
      const supabase = buildSupabaseMock({
        employees: [{ user_id: "u1", branch_id: "b1", department_id: "d1", position: "chef", phone: null, phone_country_code: null }],
        memberships: [{ user_id: "u1" }, { user_id: "u2" }],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: emptyScope,
      });

      expect(result.userIds).toContain("u1");
      expect(result.userIds).toContain("u2");
    });
  });

  describe("location scope", () => {
    it("includes employees matching location", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          { user_id: "u1", branch_id: "b1", department_id: null, position: null, phone: null, phone_country_code: null },
          { user_id: "u2", branch_id: "b2", department_id: null, position: null, phone: null, phone_country_code: null },
        ],
        memberships: [],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b1"] },
      });

      expect(result.userIds).toContain("u1");
      expect(result.userIds).not.toContain("u2");
    });
  });

  describe("user scope", () => {
    it("always includes explicitly scoped users", async () => {
      const supabase = buildSupabaseMock({
        employees: [],
        memberships: [],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, users: ["u-explicit"] },
      });

      expect(result.userIds).toContain("u-explicit");
    });
  });

  describe("phone formatting", () => {
    it("formats phone with country code correctly", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          {
            user_id: "u1",
            branch_id: "b1",
            department_id: null,
            position: null,
            phone: "5551234567",
            phone_country_code: "+1",
          },
        ],
        memberships: [],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b1"] },
      });

      expect(result.phones).toContain("+15551234567");
    });
  });

  describe("email resolution", () => {
    it("returns emails for resolved user IDs", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          { user_id: "u1", branch_id: "b1", department_id: null, position: null, phone: null, phone_country_code: null },
        ],
        memberships: [],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b1"] },
      });

      expect(result.emails).toContain("u1@test.com");
    });
  });
});
