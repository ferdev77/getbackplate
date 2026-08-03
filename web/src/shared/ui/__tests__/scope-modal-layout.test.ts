import { describe, expect, it } from "vitest";

import { getFocusTrapTargetIndex } from "@/shared/ui/scope-modal-layout";

describe("getFocusTrapTargetIndex", () => {
  it("moves forward and wraps at the end", () => {
    expect(getFocusTrapTargetIndex(0, 3, false)).toBe(1);
    expect(getFocusTrapTargetIndex(2, 3, false)).toBe(0);
  });

  it("moves backward and wraps at the start", () => {
    expect(getFocusTrapTargetIndex(2, 3, true)).toBe(1);
    expect(getFocusTrapTargetIndex(0, 3, true)).toBe(2);
  });

  it("chooses an edge when focus starts outside and handles an empty dialog", () => {
    expect(getFocusTrapTargetIndex(-1, 3, false)).toBe(0);
    expect(getFocusTrapTargetIndex(-1, 3, true)).toBe(2);
    expect(getFocusTrapTargetIndex(-1, 0, false)).toBe(-1);
  });
});
