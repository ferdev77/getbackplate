import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOrganizationByIdCached: vi.fn(),
}));

vi.mock("@/modules/organizations/cached-queries", () => ({
  getOrganizationByIdCached: mocks.getOrganizationByIdCached,
}));

import { getFormattingLocale, resolveOrganizationLocale, resolveUserLocale } from "./locale";

describe("resolveUserLocale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOrganizationByIdCached.mockResolvedValue({ integration_plan_id: null });
  });

  it("forces English for integration-plan organizations, including dual-plan organizations", async () => {
    mocks.getOrganizationByIdCached.mockResolvedValue({ integration_plan_id: "integration-plan-id" });

    await expect(resolveUserLocale({ organizationId: "org-id", userId: "user-id" })).resolves.toBe("en");
  });

  it("forces Mexican Spanish for platform-only organizations regardless of user context", async () => {
    await expect(resolveUserLocale({ organizationId: "org-id", userId: "user-id" })).resolves.toBe("es");
    await expect(resolveUserLocale({ organizationId: "org-id", userId: null })).resolves.toBe("es");
  });

  it("does not query a user preference or module fallback", async () => {
    await resolveUserLocale({ organizationId: "org-id", userId: "user-id" });
    expect(mocks.getOrganizationByIdCached).toHaveBeenCalledOnce();
  });
});

describe("organization locale policy", () => {
  it("uses only integration_plan_id as the English policy signal", () => {
    expect(resolveOrganizationLocale("integration-plan-id")).toBe("en");
    expect(resolveOrganizationLocale("")).toBe("en");
    expect(resolveOrganizationLocale(null)).toBe("es");
    expect(resolveOrganizationLocale(undefined)).toBe("es");
  });

  it("maps app locales to regional formatting locales", () => {
    expect(getFormattingLocale("es")).toBe("es-MX");
    expect(getFormattingLocale("en")).toBe("en-US");
  });
});
