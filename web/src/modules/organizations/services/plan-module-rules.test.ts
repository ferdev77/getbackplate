import { describe, expect, it } from "vitest";
import { resolveEnabledOrganizationModuleIds } from "./plan-module-rules";

const modules = [
  { id: "core", is_core: true },
  { id: "platform", is_core: false },
  { id: "integration", is_core: false },
  { id: "unrelated", is_core: false },
];

describe("resolveEnabledOrganizationModuleIds", () => {
  it("unites platform and integration plan modules", () => {
    const enabled = resolveEnabledOrganizationModuleIds({
      modules,
      platformPlanModuleIds: ["platform"],
      integrationPlanModuleIds: ["integration"],
      hasPlatformPlan: true,
      hasIntegrationPlan: true,
    });

    expect(enabled).toEqual(new Set(["core", "platform", "integration"]));
  });

  it("keeps exactly the integration plan modules for an integration-only organization", () => {
    const enabled = resolveEnabledOrganizationModuleIds({
      modules,
      platformPlanModuleIds: [],
      integrationPlanModuleIds: ["integration"],
      hasPlatformPlan: false,
      hasIntegrationPlan: true,
    });

    expect(enabled).toEqual(new Set(["integration"]));
  });

  it("includes core and platform plan modules for a platform organization", () => {
    const enabled = resolveEnabledOrganizationModuleIds({
      modules,
      platformPlanModuleIds: ["platform"],
      integrationPlanModuleIds: [],
      hasPlatformPlan: true,
      hasIntegrationPlan: false,
    });

    expect(enabled).toEqual(new Set(["core", "platform"]));
  });
});
