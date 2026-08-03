import { describe, expect, it, vi } from "vitest";

import { mapVendorMutationError, saveVendorTransaction } from "../mutation";

describe("saveVendorTransaction", () => {
  it("sends only server-derived tenant, actor, and employee scope inputs", async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        vendor_id: "vendor-1",
        vendor_name: "Acme",
        branch_ids: ["branch-a"],
        is_global: false,
        created: true,
        branches_changed: true,
      }],
      error: null,
    }));

    const result = await saveVendorTransaction({ rpc } as never, {
      organizationId: "org-guard",
      vendorId: null,
      actorId: "actor-guard",
      patch: { name: "Acme", category: "food" },
      replaceLocations: true,
      branchIds: ["branch-a"],
      employeeScopeIds: ["branch-a", "branch-b"],
    });

    expect(rpc).toHaveBeenCalledWith("save_vendor_transaction", {
      p_organization_id: "org-guard",
      p_vendor_id: null,
      p_actor_id: "actor-guard",
      p_patch: { name: "Acme", category: "food" },
      p_replace_locations: true,
      p_branch_ids: ["branch-a"],
      p_employee_scope_ids: ["branch-a", "branch-b"],
    });
    expect(result).toEqual({
      data: {
        vendorId: "vendor-1",
        vendorName: "Acme",
        branchIds: ["branch-a"],
        isGlobal: false,
        created: true,
        branchesChanged: true,
      },
      error: null,
    });
  });

  it("rejects a malformed RPC result instead of guessing location scope", async () => {
    const rpc = vi.fn(async () => ({ data: [{ vendor_id: "vendor-1" }], error: null }));

    const result = await saveVendorTransaction({ rpc } as never, {
      organizationId: "org-1",
      vendorId: null,
      actorId: "actor-1",
      patch: {},
      replaceLocations: true,
      branchIds: [],
      employeeScopeIds: null,
    });

    expect(result.error).toEqual(expect.objectContaining({ code: "INVALID_RPC_RESULT" }));
    expect(result.data).toBeNull();
  });
});

describe("mapVendorMutationError", () => {
  it.each([
    ["vendor_employee_scope_empty", 403, "vendor_employee_scope_empty"],
    ["vendor_not_found", 404, "vendor_not_found"],
    ["invalid_vendor_category", 422, "invalid_vendor_category"],
  ])("maps %s to a stable response", (message, status, code) => {
    expect(mapVendorMutationError({ message })).toEqual(expect.objectContaining({
      status,
      body: expect.objectContaining({ code }),
    }));
  });

  it("does not expose unexpected database messages", () => {
    expect(mapVendorMutationError({ code: "XX000", message: "internal table detail" })).toEqual({
      status: 500,
      body: { error: "No se pudo guardar el proveedor", code: "vendor_save_failed" },
    });
  });
});
