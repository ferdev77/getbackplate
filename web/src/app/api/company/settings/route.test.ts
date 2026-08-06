import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  audit: vi.fn(),
  impersonating: vi.fn(),
  preferencesUpsert: vi.fn(),
  preferencesMaybeSingle: vi.fn(),
  organizationMaybeSingle: vi.fn(),
  revalidateTag: vi.fn(),
}));

const serverClient = {
  from: vi.fn((table: string) => {
    if (table === "organizations") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle: mocks.organizationMaybeSingle })),
        })),
      };
    }
    if (table === "user_preferences") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: mocks.preferencesMaybeSingle })),
          })),
        })),
        upsert: mocks.preferencesUpsert,
      };
    }
    throw new Error(`Unexpected table: ${table}`);
  }),
};

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/shared/lib/access", () => ({ assertCompanyAdminModuleApi: mocks.access }));
vi.mock("@/shared/lib/audit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/shared/lib/impersonation", () => ({ isSuperadminImpersonating: mocks.impersonating }));
vi.mock("@/infrastructure/supabase/client/server", () => ({
  createSupabaseServerClient: vi.fn(async () => serverClient),
}));

function request(language?: "es" | "en") {
  return new Request("https://app.example.com/api/company/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "preferences", theme: "default", language }),
  });
}

describe("POST /api/company/settings locale policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      ok: true,
      userId: "user-1",
      tenant: { organizationId: "org-1", roleCode: "company_admin" },
    });
    mocks.impersonating.mockResolvedValue(false);
    mocks.preferencesUpsert.mockResolvedValue({ error: null });
    mocks.preferencesMaybeSingle.mockResolvedValue({
      data: {
        theme: "dark-pro",
        date_format: "YYYY-MM-DD",
        timezone_mode: "manual",
        timezone_manual: "America/Chicago",
        analytics_enabled: false,
      },
      error: null,
    });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("forces English for an integration or dual-plan organization", async () => {
    mocks.organizationMaybeSingle.mockResolvedValue({
      data: { integration_plan_id: "integration-plan-id" },
      error: null,
    });
    const { POST } = await import("./route");

    const response = await POST(request("es"));

    expect(response.status).toBe(200);
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1", user_id: "user-1", language: "en" }),
      { onConflict: "organization_id,user_id" },
    );
  });

  it("prevents a platform-only organization from writing English", async () => {
    mocks.organizationMaybeSingle.mockResolvedValue({
      data: { integration_plan_id: null },
      error: null,
    });
    const { POST } = await import("./route");

    const response = await POST(request("en"));

    expect(response.status).toBe(200);
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ organization_id: "org-1", user_id: "user-1", language: "es" }),
      { onConflict: "organization_id,user_id" },
    );
  });

  it("preserves preferences omitted from a partial request", async () => {
    mocks.organizationMaybeSingle.mockResolvedValue({
      data: { integration_plan_id: null },
      error: null,
    });
    const { POST } = await import("./route");

    const response = await POST(request("es"));

    expect(response.status).toBe(200);
    expect(mocks.preferencesUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        date_format: "YYYY-MM-DD",
        timezone_mode: "manual",
        timezone_manual: "America/Chicago",
        analytics_enabled: false,
      }),
      { onConflict: "organization_id,user_id" },
    );
  });
});
