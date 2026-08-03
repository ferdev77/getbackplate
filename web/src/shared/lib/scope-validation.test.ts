import { describe, expect, it } from "vitest";

import { validateEmployeeUserScopeWithinLocations } from "@/shared/lib/scope-validation";

type Result = { data: Array<Record<string, unknown>>; error: { message: string } | null };

function supabaseWith(results: Record<string, Result>) {
  return {
    from(table: string) {
      const result = results[table] ?? { data: [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        then: (resolve: (value: Result) => unknown) => Promise.resolve(resolve(result)),
      };
      return query;
    },
  } as never;
}

const branches = {
  data: [{ id: "loc-a" }, { id: "loc-b" }, { id: "loc-c" }],
  error: null,
};

describe("validateEmployeeUserScopeWithinLocations", () => {
  it("combina locaciones primarias, secundarias y todas desde las tres fuentes", async () => {
    const result = await validateEmployeeUserScopeWithinLocations({
      supabase: supabaseWith({
        employees: {
          data: [
            { user_id: "employee-secondary", branch_id: "loc-a", location_scope_ids: ["loc-b"], all_locations: false },
            { user_id: "employee-all", branch_id: null, location_scope_ids: [], all_locations: true },
          ],
          error: null,
        },
        memberships: {
          data: [
            { user_id: "membership-secondary", branch_id: "loc-a", location_scope_ids: ["loc-b"], all_locations: false },
          ],
          error: null,
        },
        organization_user_profiles: {
          data: [
            { user_id: "profile-primary", branch_id: "loc-b", location_scope_ids: [], all_locations: false },
            { user_id: "profile-secondary", branch_id: "loc-a", location_scope_ids: ["loc-b"], all_locations: false },
            { user_id: "profile-all", branch_id: null, location_scope_ids: [], all_locations: true },
          ],
          error: null,
        },
        branches,
      }),
      organizationId: "org-1",
      userIds: [
        "employee-secondary",
        "employee-all",
        "membership-secondary",
        "profile-primary",
        "profile-secondary",
        "profile-all",
      ],
      allowedLocationIds: ["loc-b"],
    });

    expect(result).toEqual({ ok: true });
  });

  it("rechaza a quien no comparte ninguna locacion", async () => {
    const result = await validateEmployeeUserScopeWithinLocations({
      supabase: supabaseWith({
        employees: {
          data: [{ user_id: "outside", branch_id: "loc-c", location_scope_ids: [], all_locations: false }],
          error: null,
        },
        memberships: { data: [], error: null },
        organization_user_profiles: { data: [], error: null },
        branches,
      }),
      organizationId: "org-1",
      userIds: ["outside"],
      allowedLocationIds: ["loc-b"],
    });

    expect(result).toEqual({ ok: false, field: "users" });
  });

  it("propaga errores de base de datos", async () => {
    await expect(
      validateEmployeeUserScopeWithinLocations({
        supabase: supabaseWith({
          employees: { data: [], error: null },
          memberships: { data: [], error: { message: "database unavailable" } },
          organization_user_profiles: { data: [], error: null },
          branches,
        }),
        organizationId: "org-1",
        userIds: ["user-1"],
        allowedLocationIds: ["loc-a"],
      }),
    ).rejects.toThrow("memberships: database unavailable");
  });
});
