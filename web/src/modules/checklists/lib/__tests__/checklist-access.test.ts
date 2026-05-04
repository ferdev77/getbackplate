import { describe, it, expect } from "vitest";
import { canUseChecklistTemplateInTenant } from "../access";

const baseEmployee = {
  roleCode: "employee",
  userId: "u1",
  branchId: "branch1",
  branchIds: [] as string[],
  departmentId: "dept1",
  positionIds: [] as string[],
  templateBranchId: "branch1" as string | null,
  targetScope: null as unknown,
};

// ─────────────────────────────────────────────────────────────────────────────
describe("canUseChecklistTemplateInTenant", () => {
  describe("company_admin role", () => {
    it("always has access regardless of branch", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          roleCode: "company_admin",
          branchId: null,
          templateBranchId: "some-other-branch",
        }),
      ).toBe(true);
    });

    it("always has access when templateBranchId is null", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          roleCode: "company_admin",
          templateBranchId: null,
        }),
      ).toBe(true);
    });

    it("always has access even with restrictive scope", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          roleCode: "company_admin",
          targetScope: { locations: ["other-loc"], department_ids: [], position_ids: [], users: [] },
        }),
      ).toBe(true);
    });
  });

  describe("employee role — branch matching", () => {
    it("can access when employee branch matches templateBranchId", () => {
      expect(canUseChecklistTemplateInTenant(baseEmployee)).toBe(true);
    });

    it("cannot access when employee branch does not match templateBranchId", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: "other-branch",
          templateBranchId: "branch1",
        }),
      ).toBe(false);
    });

    it("can access when null branchId matches null templateBranchId (no branch restriction)", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: null,
          templateBranchId: null,
        }),
      ).toBe(true);
    });

    it("can access when templateBranchId is null regardless of employee branch", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: "any-branch",
          templateBranchId: null,
        }),
      ).toBe(true);
    });
  });

  describe("employee role — multi-branch (branchIds)", () => {
    it("can access when one of branchIds matches templateBranchId", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: null,
          branchIds: ["branch2", "branch1"],
          templateBranchId: "branch1",
        }),
      ).toBe(true);
    });

    it("cannot access when none of branchIds match templateBranchId", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: null,
          branchIds: ["branch2", "branch3"],
          templateBranchId: "branch1",
        }),
      ).toBe(false);
    });

    it("deduplicates branchId and branchIds and still matches", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: "branch1",
          branchIds: ["branch1"],
          templateBranchId: "branch1",
        }),
      ).toBe(true);
    });
  });

  describe("employee role — scope override (users list)", () => {
    it("can access when userId is in targetScope.users even without branch match", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: null,
          branchIds: [],
          templateBranchId: null,
          targetScope: { users: ["u1"], locations: [], department_ids: [], position_ids: [] },
        }),
      ).toBe(true);
    });

    it("cannot access when userId is not in targetScope.users and no branch match", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: null,
          branchIds: [],
          templateBranchId: "branch1",
          targetScope: { users: ["other-user"], locations: [], department_ids: [], position_ids: [] },
        }),
      ).toBe(false);
    });
  });

  describe("employee role — location scope", () => {
    it("can access when branchId is in targetScope.locations and templateBranchId is null", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: "branch1",
          branchIds: [],
          templateBranchId: null,
          targetScope: { locations: ["branch1"], department_ids: [], position_ids: [], users: [] },
        }),
      ).toBe(true);
    });

    it("cannot access when branchId is not in targetScope.locations and templateBranchId is null", () => {
      expect(
        canUseChecklistTemplateInTenant({
          ...baseEmployee,
          branchId: "branch2",
          branchIds: [],
          templateBranchId: null,
          targetScope: { locations: ["branch1"], department_ids: [], position_ids: [], users: [] },
        }),
      ).toBe(false);
    });
  });
});
