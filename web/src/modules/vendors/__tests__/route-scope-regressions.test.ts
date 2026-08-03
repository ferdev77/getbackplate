import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const SRC = path.join(__dirname, "..", "..", "..");

function source(relativePath: string) {
  return readFileSync(path.join(SRC, relativePath), "utf8");
}

describe("employee vendor multi-location routes", () => {
  it("does not re-filter the resolved list through the primary branch", () => {
    const route = source("app/api/employee/vendors/route.ts");

    expect(route).not.toContain("const { organizationId, branchId } = access.tenant");
    expect(route).not.toContain("v.branchIds.includes(branchId)");
  });

  it("does not re-filter history through the primary branch", () => {
    const route = source("app/api/employee/vendors/[id]/history/route.ts");

    expect(route).not.toContain("branchIds.includes(branchId)");
    expect(route).not.toContain("isVisibleByScope");
  });
});
