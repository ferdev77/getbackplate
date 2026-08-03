import { describe, expect, it } from "vitest";

import {
  resolveChecklistSubmissionBranch,
  validateExactChecklistItemSet,
} from "./submission-integrity";

describe("validateExactChecklistItemSet", () => {
  it("accepts every expected item exactly once regardless of order", () => {
    expect(validateExactChecklistItemSet(["b", "a"], ["a", "b"])).toEqual({ ok: true });
  });

  it("rejects omitted, foreign, duplicate, and empty items", () => {
    expect(validateExactChecklistItemSet(["a"], ["a", "b"])).toEqual({ ok: false, reason: "mismatch" });
    expect(validateExactChecklistItemSet(["a", "other"], ["a", "b"])).toEqual({ ok: false, reason: "mismatch" });
    expect(validateExactChecklistItemSet(["a", "a"], ["a", "b"])).toEqual({ ok: false, reason: "duplicate" });
    expect(validateExactChecklistItemSet([], ["a"])).toEqual({ ok: false, reason: "empty" });
  });
});

describe("resolveChecklistSubmissionBranch", () => {
  it("prefers the template branch over the session branch", () => {
    expect(resolveChecklistSubmissionBranch({
      templateBranchId: "branch-b",
      tenantBranchId: "branch-a",
      employeeBranchId: "branch-c",
    })).toBe("branch-b");
  });

  it("falls back through tenant and employee branches", () => {
    expect(resolveChecklistSubmissionBranch({ templateBranchId: null, tenantBranchId: "branch-a", employeeBranchId: "branch-c" })).toBe("branch-a");
    expect(resolveChecklistSubmissionBranch({ templateBranchId: null, tenantBranchId: null, employeeBranchId: "branch-c" })).toBe("branch-c");
  });
});
