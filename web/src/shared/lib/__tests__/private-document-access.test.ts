import { describe, expect, it } from "vitest";

import { canReadDocumentInTenant } from "../document-access";
import { isEmployeePrivateDocument } from "../employee-private-documents";

const privateScope = {
  internal_only: true,
  locations: ["owner-branch"],
  department_ids: ["owner-department"],
  position_ids: [],
  users: ["owner-user"],
};

describe("private employee document rules", () => {
  it("recognizes an explicitly internal employee document", () => {
    expect(isEmployeePrivateDocument(privateScope, "Documento personalizado")).toBe(true);
  });

  it("allows the explicitly assigned owner in the pure tenant scope rule", () => {
    expect(canReadDocumentInTenant({
      roleCode: "employee",
      userId: "owner-user",
      branchId: null,
      departmentId: null,
      isDirectlyAssigned: false,
      accessScope: privateScope,
    })).toBe(true);
  });

  it("denies another employee outside the private document's explicit scope", () => {
    expect(canReadDocumentInTenant({
      roleCode: "employee",
      userId: "other-user",
      branchId: "other-branch",
      departmentId: "other-department",
      isDirectlyAssigned: false,
      accessScope: privateScope,
    })).toBe(false);
  });
});
