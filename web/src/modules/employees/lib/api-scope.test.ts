import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  actor: null as {
    all_locations?: boolean | null;
    location_scope_ids?: string[] | null;
    branch_id?: string | null;
  } | null,
  eq: vi.fn(),
}));

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => {
      const query = {
        select: vi.fn(() => query),
        eq: mocks.eq.mockImplementation(() => query),
        maybeSingle: vi.fn(async () => ({ data: mocks.actor })),
      };
      return query;
    }),
  })),
}));

import { isEmployeeInScope, resolveHrScope } from "./api-scope";

describe("resolveHrScope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor = null;
  });

  it("resolves all_locations as an unrestricted scope within the guarded tenant", async () => {
    mocks.actor = {
      all_locations: true,
      branch_id: "branch-primary",
      location_scope_ids: ["branch-secondary"],
    };

    await expect(resolveHrScope("org-guard", "actor-1")).resolves.toBeNull();
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org-guard");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "actor-1");
  });

  it("combines the primary branch and multiple assigned locations without duplicates", async () => {
    mocks.actor = {
      all_locations: false,
      branch_id: "branch-a",
      location_scope_ids: ["branch-b", "branch-a", "branch-c"],
    };

    await expect(resolveHrScope("org-guard", "actor-1")).resolves.toEqual([
      "branch-b",
      "branch-a",
      "branch-c",
    ]);
  });

  it("denies all locations when the actor has no employee record", async () => {
    mocks.actor = null;

    await expect(resolveHrScope("org-guard", "missing-actor")).resolves.toEqual([]);
  });

  it("denies all locations when the actor has no assigned location", async () => {
    mocks.actor = { all_locations: false, branch_id: null, location_scope_ids: [] };

    await expect(resolveHrScope("org-guard", "actor-without-scope")).resolves.toEqual([]);
  });
});

describe("isEmployeeInScope", () => {
  it("accepts an employee when any one of multiple branches intersects the HR scope", () => {
    expect(isEmployeeInScope({
      branch_id: "branch-a",
      location_scope_ids: ["branch-b", "branch-c"],
    }, ["branch-c", "branch-d"])).toBe(true);
  });

  it("denies an employee whose branches are all outside the HR scope", () => {
    expect(isEmployeeInScope({
      branch_id: "branch-a",
      location_scope_ids: ["branch-b"],
    }, ["branch-c", "branch-d"])).toBe(false);
  });

  it("treats a null scope from all_locations as unrestricted", () => {
    expect(isEmployeeInScope({ branch_id: "any-branch" }, null)).toBe(true);
  });

  it("treats an empty actor scope as no access", () => {
    expect(isEmployeeInScope({ branch_id: "branch-a", all_locations: true }, [])).toBe(false);
  });
});
