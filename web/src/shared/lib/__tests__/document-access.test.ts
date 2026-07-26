import { describe, expect, it } from "vitest";
import {
  canReadDocumentInTenant,
  resolveDocumentEffectiveScope,
} from "../document-access";

const restrictedScope = {
  locations: ["branch-a"],
  department_ids: ["department-a"],
  position_ids: ["position-a"],
  users: [],
};

const employee = {
  roleCode: "employee",
  userId: "user-a",
  branchId: "branch-a",
  departmentId: "department-a",
  positionIds: ["position-a"],
  isDirectlyAssigned: false,
  accessScope: restrictedScope,
};

describe("canReadDocumentInTenant", () => {
  it("allows a company_admin regardless of scope", () => {
    expect(canReadDocumentInTenant({
      ...employee,
      roleCode: "company_admin",
      branchId: "other-branch",
      accessScope: restrictedScope,
    })).toBe(true);
  });

  it("allows an employee assigned directly to the document", () => {
    expect(canReadDocumentInTenant({
      ...employee,
      branchId: "other-branch",
      isDirectlyAssigned: true,
    })).toBe(true);
  });

  it("denies an unassigned employee outside the scope", () => {
    expect(canReadDocumentInTenant({
      ...employee,
      branchId: "other-branch",
    })).toBe(false);
  });

  it("allows an employee when any of their branches matches", () => {
    expect(canReadDocumentInTenant({
      ...employee,
      branchId: null,
      branchIds: ["branch-b", "branch-a", "branch-c"],
    })).toBe(true);
  });

  it("requires location, department, and position filters to match with AND", () => {
    expect(canReadDocumentInTenant(employee)).toBe(true);

    expect(canReadDocumentInTenant({
      ...employee,
      departmentId: "other-department",
    })).toBe(false);

    expect(canReadDocumentInTenant({
      ...employee,
      positionIds: ["other-position"],
    })).toBe(false);
  });

  it("allows an explicit user override despite filter mismatches", () => {
    expect(canReadDocumentInTenant({
      ...employee,
      branchId: "other-branch",
      departmentId: "other-department",
      positionIds: ["other-position"],
      accessScope: { ...restrictedScope, users: ["user-a"] },
    })).toBe(true);
  });
});

describe("resolveDocumentEffectiveScope", () => {
  const folderScope = {
    locations: ["folder-branch"],
    department_ids: [],
    position_ids: [],
    users: [],
  };
  const folders = new Map([
    ["folder-a", {
      id: "folder-a",
      name: "Folder A",
      parent_id: null,
      access_scope: folderScope,
    }],
  ]);

  it("prefers an explicit document scope over its folder scope", () => {
    const documentScope = {
      locations: [],
      department_ids: [],
      position_ids: [],
      users: ["user-a"],
    };

    expect(resolveDocumentEffectiveScope({
      folder_id: "folder-a",
      access_scope: documentScope,
    }, folders)).toBe(documentScope);
  });

  it("falls back to the folder only when the document has no explicit scope", () => {
    expect(resolveDocumentEffectiveScope({
      folder_id: "folder-a",
      access_scope: {
        locations: [],
        department_ids: [],
        position_ids: [],
        users: [],
      },
    }, folders)).toBe(folderScope);
  });
});
