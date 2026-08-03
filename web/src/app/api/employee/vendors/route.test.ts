import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  scope: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertEmployeeCapabilityApi: mocks.access }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/vendors/notifications", () => ({ notifyVendorEvent: mocks.notify }));
vi.mock("@/modules/vendors/lib/employee-scope", () => ({
  resolveEmployeeVendorScope: mocks.scope,
  locacionesFueraDeAlcance: (branchIds: string[], allowedIds: string[]) =>
    branchIds.filter((id) => !allowedIds.includes(id)),
}));
vi.mock("@/modules/vendors/mutation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/vendors/mutation")>();
  return { ...original, saveVendorTransaction: mocks.save };
});
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ rpc: vi.fn() })),
}));

const ORG_ID = "00000000-0000-4000-8000-000000000011";
const USER_ID = "00000000-0000-4000-8000-000000000012";
const VENDOR_ID = "00000000-0000-4000-8000-000000000013";
const BRANCH_A = "00000000-0000-4000-8000-000000000014";
const BRANCH_B = "00000000-0000-4000-8000-000000000015";

function request(body: Record<string, unknown>) {
  return new Request("https://test.invalid/api/employee/vendors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/employee/vendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      tenant: { organizationId: ORG_ID, roleCode: "employee" },
    });
    mocks.scope.mockResolvedValue({ allowedLocationIds: [BRANCH_A, BRANCH_B], visibleVendorIds: new Set() });
    mocks.save.mockResolvedValue({
      data: {
        vendorId: VENDOR_ID,
        vendorName: "Acme",
        branchIds: [BRANCH_A, BRANCH_B],
        isGlobal: false,
        created: true,
        branchesChanged: true,
      },
      error: null,
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
  });

  it("uses every allowed location when the employee leaves branch_ids empty", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ name: "Acme", category: "alimentos", branch_ids: [] }));

    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      branchIds: [BRANCH_A, BRANCH_B],
      employeeScopeIds: [BRANCH_A, BRANCH_B],
    }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      locationScope: { branchIds: [BRANCH_A, BRANCH_B], isGlobal: false },
    }));
  });

  it("rejects an employee with no locations before calling the RPC", async () => {
    mocks.scope.mockResolvedValue({ allowedLocationIds: [], visibleVendorIds: new Set() });
    const { POST } = await import("./route");
    const response = await POST(request({ name: "Acme", category: "alimentos", branch_ids: [] }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "No tienes locaciones habilitadas para gestionar proveedores",
      code: "vendor_employee_scope_empty",
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
