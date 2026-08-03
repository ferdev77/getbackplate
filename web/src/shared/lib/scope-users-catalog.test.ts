import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClient = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/supabase/client/admin", () => ({ createSupabaseAdminClient }));

import { buildScopeUsersCatalog } from "@/shared/lib/scope-users-catalog";

function adminWith(rows: Record<string, Array<Record<string, unknown>>>) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
    from(table: string) {
      const result = { data: rows[table] ?? [], error: null };
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        then: (resolve: (value: typeof result) => unknown) => Promise.resolve(resolve(result)),
      };
      return query;
    },
  };
}

beforeEach(() => createSupabaseAdminClient.mockReset());

describe("buildScopeUsersCatalog", () => {
  it("conserva estructura y locaciones efectivas de un perfil sin legajo", async () => {
    createSupabaseAdminClient.mockReturnValue(
      adminWith({
        employees: [],
        organization_user_profiles: [
          {
            id: "profile-1",
            user_id: "user-1",
            first_name: "Ana",
            last_name: "Diaz",
            branch_id: "loc-a",
            all_locations: false,
            location_scope_ids: ["loc-b"],
            department_id: "dep-1",
            position_id: "pos-1",
          },
        ],
        memberships: [
          {
            user_id: "user-1",
            role_id: "role-employee",
            status: "active",
            branch_id: "loc-a",
            all_locations: false,
            location_scope_ids: ["loc-c"],
          },
        ],
        roles: [{ id: "role-employee", code: "employee" }],
        branches: [
          { id: "loc-a", name: "Centro", city: null },
          { id: "loc-b", name: "Norte", city: null },
          { id: "loc-c", name: "Sur", city: null },
        ],
        organization_departments: [{ id: "dep-1", name: "Cocina" }],
        department_positions: [{ id: "pos-1", name: "Chef" }],
      }),
    );

    const catalog = await buildScopeUsersCatalog("org-1");

    expect(catalog).toEqual([
      expect.objectContaining({
        id: "up-profile-1",
        user_id: "user-1",
        branch_id: "loc-a",
        location_ids: ["loc-a", "loc-b", "loc-c"],
        department_id: "dep-1",
        position_id: "pos-1",
        location_label: "Centro",
        department_label: "Cocina",
        position_label: "Chef",
      }),
    ]);
  });
});
