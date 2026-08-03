import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  scope: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
  existing: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertEmployeeCapabilityApi: mocks.access }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/vendors/notifications", () => ({
  notifyVendorEvent: mocks.notify,
  sucursalesDelProveedor: vi.fn(),
}));
vi.mock("@/modules/vendors/lib/employee-scope", () => ({
  resolveEmployeeVendorScope: mocks.scope,
  locacionesFueraDeAlcance: (branchIds: string[], allowedIds: string[]) =>
    branchIds.filter((id) => !allowedIds.includes(id)),
}));
vi.mock("@/modules/vendors/mutation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/vendors/mutation")>();
  return { ...original, saveEmployeeVendorTransaction: mocks.save };
});
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => {
        const query = { eq: vi.fn(() => query), maybeSingle: mocks.existing };
        return query;
      }),
    })),
  })),
}));

const ORG_ID = "00000000-0000-4000-8000-000000000021";
const USER_ID = "00000000-0000-4000-8000-000000000022";
const VENDOR_ID = "00000000-0000-4000-8000-000000000023";
const BRANCH_A = "00000000-0000-4000-8000-000000000024";
const BRANCH_B = "00000000-0000-4000-8000-000000000025";

function request(body: Record<string, unknown>) {
  return new Request(`https://test.invalid/api/employee/vendors/${VENDOR_ID}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/employee/vendors/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      tenant: { organizationId: ORG_ID, roleCode: "employee" },
    });
    mocks.scope.mockResolvedValue({
      allowedLocationIds: [BRANCH_A, BRANCH_B],
      visibleVendorIds: new Set([VENDOR_ID]),
    });
    mocks.existing.mockResolvedValue({ data: { id: VENDOR_ID, name: "Old", is_active: true }, error: null });
    mocks.save.mockResolvedValue({
      data: {
        vendorId: VENDOR_ID,
        vendorName: "Old",
        branchIds: [BRANCH_A, BRANCH_B],
        isGlobal: false,
        created: false,
        branchesChanged: true,
      },
      error: null,
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
  });

  it("maps an empty selection to every allowed location instead of global", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(request({ branch_ids: [] }), { params: Promise.resolve({ id: VENDOR_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      replaceLocations: true,
      branchIds: [BRANCH_A, BRANCH_B],
      employeeScopeIds: [BRANCH_A, BRANCH_B],
    }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      locationScope: { branchIds: [BRANCH_A, BRANCH_B], isGlobal: false },
    }));
  });
});
