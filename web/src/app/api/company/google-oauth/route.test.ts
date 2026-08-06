import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  moduleEnabled: vi.fn(),
  impersonating: vi.fn(),
  status: vi.fn(),
  save: vi.fn(),
  disable: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/shared/lib/access", () => ({
  assertCompanyAdminModuleApi: mocks.access,
  isModuleEnabledForOrganization: mocks.moduleEnabled,
}));
vi.mock("@/shared/lib/impersonation", () => ({ isSuperadminImpersonating: mocks.impersonating }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/modules/auth/google-tenant/service", () => ({
  getTenantGoogleOAuthStatus: mocks.status,
  saveTenantGoogleOAuthConfig: mocks.save,
  disableTenantGoogleOAuthConfig: mocks.disable,
}));

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const CLIENT_ID = "123456789-tenant.apps.googleusercontent.com";

describe("company Google OAuth settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ ok: true, userId: USER_ID, tenant: { organizationId: ORGANIZATION_ID } });
    mocks.moduleEnabled.mockResolvedValue(true);
    mocks.impersonating.mockResolvedValue(false);
    mocks.status.mockResolvedValue({ configured: false, clientId: "", secretConfigured: false, status: "unconfigured" });
    mocks.save.mockResolvedValue({ configured: true, clientId: CLIENT_ID, secretConfigured: true, status: "draft" });
  });

  it("derives the tenant and actor from authenticated access instead of the payload", async () => {
    const { PUT } = await import("./route");
    const response = await PUT(new Request("https://app.example.com/api/company/google-oauth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        clientSecret: "GOCSPX-secret-value",
        organizationId: "00000000-0000-4000-8000-000000000099",
      }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      userId: USER_ID,
      clientId: CLIENT_ID,
      clientSecret: "GOCSPX-secret-value",
    });
  });

  it("blocks security credential writes while impersonating", async () => {
    mocks.impersonating.mockResolvedValue(true);
    const { PUT } = await import("./route");
    const response = await PUT(new Request("https://app.example.com/api/company/google-oauth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: "GOCSPX-secret-value" }),
    }));
    expect(response.status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("requires Custom Branding and valid Google credential shapes", async () => {
    mocks.moduleEnabled.mockResolvedValue(false);
    const { PUT } = await import("./route");
    const disabled = await PUT(new Request("https://app.example.com/api/company/google-oauth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: "GOCSPX-secret-value" }),
    }));
    expect(disabled.status).toBe(403);

    mocks.moduleEnabled.mockResolvedValue(true);
    const invalid = await PUT(new Request("https://app.example.com/api/company/google-oauth", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: "not-google", clientSecret: "short" }),
    }));
    expect(invalid.status).toBe(400);
  });
});
