import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  save: vi.fn(),
  audit: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertCompanyAdminModuleApi: mocks.access }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/vendors/notifications", () => ({ notifyVendorEvent: mocks.notify }));
vi.mock("@/modules/vendors/mutation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/vendors/mutation")>();
  return { ...original, saveVendorTransaction: mocks.save };
});
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({ rpc: vi.fn() })),
}));

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const VENDOR_ID = "00000000-0000-4000-8000-000000000003";

function request(body: Record<string, unknown>) {
  return new Request("https://test.invalid/api/company/vendors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/company/vendors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      tenant: { organizationId: ORG_ID },
    });
    mocks.save.mockResolvedValue({
      data: {
        vendorId: VENDOR_ID,
        vendorName: "Acme",
        branchIds: [],
        isGlobal: true,
        created: true,
        branchesChanged: true,
      },
      error: null,
    });
    mocks.audit.mockResolvedValue(undefined);
    mocks.notify.mockResolvedValue(undefined);
  });

  it("creates an explicit global vendor through the transactional RPC", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ name: "Acme", category: "alimentos", branch_ids: [] }));

    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      organizationId: ORG_ID,
      actorId: USER_ID,
      branchIds: [],
      employeeScopeIds: null,
      replaceLocations: true,
    }));
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      locationScope: { branchIds: [], isGlobal: true },
    }));
  });

  it("does not audit or notify when the RPC rejects the category", async () => {
    mocks.save.mockResolvedValue({ data: null, error: { code: "22023", message: "invalid_vendor_category" } });
    const { POST } = await import("./route");
    const response = await POST(request({ name: "Acme", category: "missing", branch_ids: [] }));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({ error: "Categoría inválida", code: "invalid_vendor_category" });
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
