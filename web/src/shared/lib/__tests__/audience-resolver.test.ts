import { describe, it, expect, vi } from "vitest";
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
  branches?: object[];
}) {
  const { employees = [], positions = [], memberships = [], profiles = [], branches = [] } = overrides;

  const tableMap: Record<string, object[]> = {
    employees,
    department_positions: positions,
    memberships,
    organization_user_profiles: profiles,
    branches,
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

  // Regla de Oro: OR dentro de una dimension, AND entre dimensiones pobladas.
  // Antes esto se resolvia todo con OR, asi que agregar un filtro no reducia
  // la audiencia. Ningun test cubria dos dimensiones a la vez.
  describe("dimensiones combinadas (AND)", () => {
    const empleados = [
      // Sucursal correcta y departamento correcto.
      { user_id: "u-ambas", branch_id: "b1", department_id: "d1", position: null, phone: null, phone_country_code: null },
      // Sucursal correcta pero otro departamento.
      { user_id: "u-solo-ubic", branch_id: "b1", department_id: "d2", position: null, phone: null, phone_country_code: null },
      // Departamento correcto pero otra sucursal.
      { user_id: "u-solo-depto", branch_id: "b2", department_id: "d1", position: null, phone: null, phone_country_code: null },
    ];

    it("requires every populated dimension, not just one", async () => {
      const supabase = buildSupabaseMock({ employees: empleados, memberships: [], profiles: [], positions: [] });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b1"], department_ids: ["d1"] },
      });

      expect(result.userIds).toContain("u-ambas");
      expect(result.userIds).not.toContain("u-solo-ubic");
      expect(result.userIds).not.toContain("u-solo-depto");
    });

    it("keeps a listed user even when the filters exclude them", async () => {
      const supabase = buildSupabaseMock({ employees: empleados, memberships: [], profiles: [], positions: [] });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b1"], department_ids: ["d1"], users: ["u-solo-depto"] },
      });

      expect(result.userIds).toContain("u-ambas");
      expect(result.userIds).toContain("u-solo-depto");
      expect(result.userIds).not.toContain("u-solo-ubic");
    });

    it("matches any value inside a single dimension (OR within a dimension)", async () => {
      const supabase = buildSupabaseMock({ employees: empleados, memberships: [], profiles: [], positions: [] });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b1", "b2"] },
      });

      expect(result.userIds).toEqual(expect.arrayContaining(["u-ambas", "u-solo-ubic", "u-solo-depto"]));
    });
  });

  describe("alcance de solo personas", () => {
    it("does not broadcast to the whole organization", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          { user_id: "u-listado", branch_id: "b1", department_id: null, position: null, phone: null, phone_country_code: null },
          { user_id: "u-otro", branch_id: "b1", department_id: null, position: null, phone: null, phone_country_code: null },
        ],
        memberships: [{ user_id: "u-listado" }, { user_id: "u-otro" }],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, users: ["u-listado"] },
      });

      expect(result.userIds).toContain("u-listado");
      expect(result.userIds).not.toContain("u-otro");
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

  describe("multi-location scope", () => {
    it("includes an employee whose location_scope_ids cover the targeted branch, not just their primary branch_id", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          {
            user_id: "u1",
            branch_id: "b1",
            all_locations: false,
            location_scope_ids: ["b2", "b3"],
            department_id: null,
            position: null,
            phone: null,
            phone_country_code: null,
          },
        ],
        memberships: [],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b3"] },
      });

      expect(result.userIds).toContain("u1");
    });

    it("includes an employee whose multi-location access is only set on the membership row", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          { user_id: "u1", branch_id: "b1", all_locations: false, location_scope_ids: [], department_id: null, position: null, phone: null, phone_country_code: null },
        ],
        memberships: [
          { user_id: "u1", branch_id: "b1", all_locations: false, location_scope_ids: ["b2"] },
        ],
        profiles: [],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b2"] },
      });

      expect(result.userIds).toContain("u1");
    });

    it("expands all_locations to every active branch in the org", async () => {
      const supabase = buildSupabaseMock({
        employees: [
          { user_id: "u1", branch_id: "b1", all_locations: true, location_scope_ids: [], department_id: null, position: null, phone: null, phone_country_code: null },
        ],
        memberships: [],
        profiles: [],
        positions: [],
        branches: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b3"] },
      });

      expect(result.userIds).toContain("u1");
    });

    it("includes a non-employee profile (is_employee=false) matching a location via location_scope_ids", async () => {
      const supabase = buildSupabaseMock({
        employees: [],
        memberships: [],
        profiles: [
          { user_id: "u-profile", branch_id: "b1", all_locations: false, location_scope_ids: ["b2"], department_id: null, position_id: null, phone: null },
        ],
        positions: [],
      });

      const result = await resolveAudienceContacts({
        supabase,
        organizationId: "org1",
        scope: { ...emptyScope, locations: ["b2"] },
      });

      expect(result.userIds).toContain("u-profile");
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
