import { describe, expect, it } from "vitest";
import { shouldEnableRegistrationModule } from "./registration-module-rules";

const modules = [
  { code: "dashboard", isCore: true },
  { code: "settings", isCore: true },
  { code: "documents", isCore: true },
  { code: "qbo_r365", isCore: false },
];

describe("shouldEnableRegistrationModule", () => {
  it("uses only dashboard as the blocked integration onboarding surface", () => {
    expect(modules.filter((module) => shouldEnableRegistrationModule(module, "integration")).map((module) => module.code))
      .toEqual(["dashboard"]);
  });

  it("keeps core modules for platform onboarding", () => {
    expect(modules.filter((module) => shouldEnableRegistrationModule(module, "platform")).map((module) => module.code))
      .toEqual(["dashboard", "settings", "documents"]);
  });
});
