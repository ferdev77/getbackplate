import { describe, expect, it } from "vitest";

import {
  getEmptyEmployeeDelegatedPermissions,
  hasEmployeeDelegatedCapability,
  normalizeEmployeeDelegatedPermissions,
} from "./module-permissions";

describe("employee delegated permissions", () => {
  it("keeps default employee access read-only for the core portal modules", () => {
    const permissions = getEmptyEmployeeDelegatedPermissions();

    expect(permissions.announcements).toEqual({ view: true, create: false, edit: false, delete: false });
    expect(permissions.checklists).toEqual({ view: true, create: false, edit: false, delete: false });
    expect(permissions.documents).toEqual({ view: true, create: false, edit: false, delete: false });
    expect(permissions.employees.view).toBe(false);
  });

  it("accepts only literal boolean grants and does not coerce truthy input", () => {
    const permissions = normalizeEmployeeDelegatedPermissions({
      documents: { view: true, create: "true", edit: 1, delete: false },
    });

    expect(permissions.documents).toEqual({ view: true, create: false, edit: false, delete: false });
  });

  it("implies view for employee management mutations", () => {
    const permissions = normalizeEmployeeDelegatedPermissions({
      employees: { view: false, create: true, edit: false, delete: false },
    });

    expect(permissions.employees.view).toBe(true);
    expect(hasEmployeeDelegatedCapability(permissions, "employees", "create")).toBe(true);
  });

  it("enforces capabilities that employees can never receive", () => {
    const permissions = normalizeEmployeeDelegatedPermissions({
      ai_assistant: { view: true, create: true, edit: true, delete: true },
      maintenance: { view: true, create: true, edit: true, delete: true },
    });

    expect(hasEmployeeDelegatedCapability(permissions, "ai_assistant", "create")).toBe(true);
    expect(hasEmployeeDelegatedCapability(permissions, "ai_assistant", "view")).toBe(false);
    expect(hasEmployeeDelegatedCapability(permissions, "maintenance", "delete")).toBe(false);
  });
});
