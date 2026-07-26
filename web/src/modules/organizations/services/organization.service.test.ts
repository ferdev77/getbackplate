import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tables: [] as string[],
  moduleRows: [
    { id: "qbo", code: "qbo_r365", is_core: false },
    { id: "settings", code: "settings", is_core: true },
    { id: "branding", code: "custom_branding", is_core: false },
    { id: "dashboard", code: "dashboard", is_core: true },
  ],
  planModulesByPlan: new Map<string, Array<{ module_id: string }>>(),
  organizationModulesUpsert: vi.fn(),
  organizationLimitsUpsert: vi.fn(),
}));

function planModulesQuery() {
  let planId = "";
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => {
      if (column === "plan_id") {
        planId = String(value);
        return query;
      }
      return Promise.resolve({ data: mocks.planModulesByPlan.get(planId) ?? [] });
    }),
  };
  return query;
}

const adminClient = {
  from: vi.fn((table: string) => {
    mocks.tables.push(table);
    if (table === "module_catalog") {
      return {
        select: vi.fn(async () => ({ data: mocks.moduleRows })),
      };
    }
    if (table === "plan_modules") return planModulesQuery();
    if (table === "organization_modules") {
      return { upsert: mocks.organizationModulesUpsert };
    }
    if (table === "organization_limits") {
      return { upsert: mocks.organizationLimitsUpsert };
    }
    throw new Error(`Unexpected table in plan synchronization: ${table}`);
  }),
};

vi.mock("@/infrastructure/supabase/client/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => adminClient),
}));

describe("syncOrganizationPlan connection safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tables.length = 0;
    mocks.planModulesByPlan.clear();
    mocks.planModulesByPlan.set("integration-connect", [
      { module_id: "qbo" },
      { module_id: "settings" },
      { module_id: "branding" },
    ]);
    mocks.organizationModulesUpsert.mockResolvedValue({ error: null });
    mocks.organizationLimitsUpsert.mockResolvedValue({ error: null });
  });

  it("updates integration-only entitlements without touching QBO connections or tokens", async () => {
    const { syncOrganizationPlan } = await import("./organization.service");

    const result = await syncOrganizationPlan({
      organizationId: "future-integration-org",
      planId: null,
      integrationPlanId: "integration-connect",
    });

    expect(result).toEqual({ ok: true });
    expect(mocks.tables).not.toContain("integration_connections");
    expect(mocks.tables).not.toContain("integration_settings");
    expect(mocks.tables).not.toContain("qbo_r365_sync_configs");
    expect(mocks.tables).not.toContain("qbo_oauth_attempts");

    const rows = mocks.organizationModulesUpsert.mock.calls[0]?.[0] as Array<{
      module_id: string;
      is_enabled: boolean;
    }>;
    expect(rows.filter((row) => row.is_enabled).map((row) => row.module_id).sort()).toEqual([
      "branding",
      "qbo",
      "settings",
    ]);
    expect(rows.find((row) => row.module_id === "dashboard")?.is_enabled).toBe(false);
  });
});
