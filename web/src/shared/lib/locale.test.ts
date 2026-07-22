import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationByIdCached: vi.fn(),
  getUserPreferencesCached: vi.fn(),
  isModuleEnabledForOrganization: vi.fn(),
}));

vi.mock("@/modules/organizations/cached-queries", () => ({
  getOrganizationByIdCached: mocks.getOrganizationByIdCached,
  getUserPreferencesCached: mocks.getUserPreferencesCached,
}));

vi.mock("@/shared/lib/tenant-modules", () => ({
  isModuleEnabledForOrganization: mocks.isModuleEnabledForOrganization,
}));

import { resolveUserLocale } from "./locale";

describe("resolveUserLocale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationByIdCached.mockResolvedValue({ integration_plan_id: null });
    mocks.getUserPreferencesCached.mockResolvedValue(null);
    mocks.isModuleEnabledForOrganization.mockResolvedValue(false);
  });

  it("forces English for integration-plan organizations", async () => {
    mocks.getOrganizationByIdCached.mockResolvedValue({ integration_plan_id: "integration-plan-id" });
    mocks.getUserPreferencesCached.mockResolvedValue({ language: "es" });

    await expect(resolveUserLocale({ organizationId: "org-id", userId: "user-id" })).resolves.toBe("en");
  });

  it("keeps explicit preferences for non-integration organizations", async () => {
    mocks.getUserPreferencesCached.mockResolvedValue({ language: "es" });

    await expect(resolveUserLocale({ organizationId: "org-id", userId: "user-id" })).resolves.toBe("es");
  });

  it("defaults module-enabled organizations to English", async () => {
    mocks.isModuleEnabledForOrganization.mockResolvedValue(true);

    await expect(resolveUserLocale({ organizationId: "org-id", userId: null })).resolves.toBe("en");
  });
});
