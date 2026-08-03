import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
  existing: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertCompanyAdminModuleApi: mocks.access }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/vendors/notifications", () => ({
  notifyVendorEvent: mocks.notify,
  sucursalesDelProveedor: vi.fn(),
}));
vi.mock("@/modules/vendors/mutation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/vendors/mutation")>();
  return { ...original, saveVendorTransaction: mocks.save };
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

const ORG_ID = "00000000-0000-4000-8000-000000000031";
const USER_ID = "00000000-0000-4000-8000-000000000032";
const VENDOR_ID = "00000000-0000-4000-8000-000000000033";

function request(body: Record<string, unknown>) {
  return new Request(`https://test.invalid/api/company/vendors/${VENDOR_ID}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PUT /api/company/vendors/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      tenant: { organizationId: ORG_ID },
    });
    mocks.existing.mockResolvedValue({ data: { id: VENDOR_ID, name: "Acme", is_active: true }, error: null });
    mocks.save.mockResolvedValue({
      data: {
        vendorId: VENDOR_ID,
        vendorName: "Acme",
        branchIds: [],
        isGlobal: true,
        created: false,
        branchesChanged: true,
      },
      error: null,
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
  });

  it("allows a company admin to replace locations with explicit global scope", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(request({ branch_ids: [] }), { params: Promise.resolve({ id: VENDOR_ID }) });

    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      replaceLocations: true,
      branchIds: [],
      employeeScopeIds: null,
    }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      locationScope: { branchIds: [], isGlobal: true },
    }));
  });
});
