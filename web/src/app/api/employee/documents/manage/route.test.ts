import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAccess: vi.fn(),
  existingDocument: null as { id: string; owner_user_id: string; folder_id: string | null } | null,
  selectEq: vi.fn(),
  update: vi.fn(),
  updateEq: vi.fn(),
  linkedDocument: vi.fn(),
  ensureRoot: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({ assertEmployeeCapabilityApi: mocks.assertAccess }));
vi.mock("@/shared/lib/document-domain", () => ({ isEmployeeLinkedDocument: mocks.linkedDocument }));
vi.mock("@/shared/lib/employee-documents-root-folder", () => ({
  ensureEmployeeDocumentsRootFolder: mocks.ensureRoot,
}));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/documents/revalidate-cache", () => ({ revalidateDocumentsCaches: mocks.revalidate }));
vi.mock("@/shared/lib/file-security", () => ({ analyzeUploadedFile: vi.fn() }));
vi.mock("@/shared/lib/storage-guardrails", () => ({ isSafeTenantStoragePath: vi.fn(() => true) }));
vi.mock("@/shared/lib/plan-limits", () => ({
  assertPlanLimitForStorage: vi.fn(),
  getPlanLimitErrorMessage: vi.fn(),
}));
vi.mock("@/shared/lib/scope-validation", () => ({
  normalizeScopeSelection: vi.fn(() => []),
  validateEmployeeUserScopeWithinLocations: vi.fn(),
  validateTenantScopeReferences: vi.fn(),
}));
vi.mock("@/shared/lib/scope-policy", () => ({ enforceLocationPolicy: vi.fn() }));
vi.mock("@/shared/lib/employee-api-scope", () => ({ resolveEmployeeAllowedLocationIds: vi.fn() }));
vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table !== "documents") throw new Error(`Unexpected table: ${table}`);

      const selectQuery = {
        eq: mocks.selectEq.mockImplementation(() => selectQuery),
        maybeSingle: vi.fn(async () => ({ data: mocks.existingDocument })),
      };
      const updateQuery = {
        eq: mocks.updateEq.mockImplementation(() => updateQuery),
        error: null,
      };

      return {
        select: vi.fn(() => selectQuery),
        update: mocks.update.mockImplementation(() => updateQuery),
      };
    }),
    storage: {},
  })),
}));

function patchRequest(body: Record<string, unknown>) {
  return new Request("https://test.invalid/api/employee/documents/manage", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/employee/documents/manage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertAccess.mockResolvedValue({
      ok: true,
      userId: "owner-user",
      tenant: { organizationId: "org-from-guard", branchId: "branch-from-guard" },
    });
    mocks.existingDocument = { id: "document-1", owner_user_id: "owner-user", folder_id: "folder-1" };
    mocks.ensureRoot.mockResolvedValue({ folderId: "root-folder" });
    mocks.linkedDocument.mockResolvedValue(false);
    mocks.audit.mockResolvedValue(undefined);
  });

  it("edits an owned document and derives every tenant id from the guard, not the body", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({
      documentId: "document-1",
      title: "Nuevo titulo",
      organizationId: "org-from-attacker-body",
    }));

    expect(response.status).toBe(200);
    expect(mocks.selectEq).toHaveBeenCalledWith("organization_id", "org-from-guard");
    expect(mocks.update).toHaveBeenCalledWith({ title: "Nuevo titulo" });
    expect(mocks.updateEq).toHaveBeenCalledWith("organization_id", "org-from-guard");
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "org-from-guard",
      actorId: "owner-user",
    }));
    expect(mocks.selectEq).not.toHaveBeenCalledWith("organization_id", "org-from-attacker-body");
    expect(mocks.updateEq).not.toHaveBeenCalledWith("organization_id", "org-from-attacker-body");
  });

  it("denies editing another employee's document before mutation", async () => {
    mocks.existingDocument = { id: "document-1", owner_user_id: "other-user", folder_id: "folder-1" };
    const { PATCH } = await import("./route");
    const response = await PATCH(patchRequest({ documentId: "document-1", title: "Ataque" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Solo puedes editar documentos creados por ti" });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
