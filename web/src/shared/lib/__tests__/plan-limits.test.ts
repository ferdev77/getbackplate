import { describe, it, expect } from "vitest";
import {
  PlanLimitExceededError,
  PlanDowngradeBlockedError,
  getPlanLimitErrorMessage,
  type PlanLimitResource,
} from "../plan-limits";

describe("PlanLimitExceededError", () => {
  it("formats non-storage message correctly", () => {
    const err = new PlanLimitExceededError({ resource: "empleados", current: 10, limit: 10, adding: 1 });
    expect(err.message).toBe("Limite de empleados alcanzado (10/10). Actualiza tu plan para continuar.");
  });

  it("formats storage message with bytes", () => {
    const err = new PlanLimitExceededError({ resource: "almacenamiento", current: 500, limit: 1000, adding: 100 });
    expect(err.message).toContain("bytes");
    expect(err.message).toBe("Limite de almacenamiento alcanzado (500/1000 bytes). Actualiza tu plan para continuar.");
  });

  it("sets name to PlanLimitExceededError", () => {
    const err = new PlanLimitExceededError({ resource: "locaciones", current: 3, limit: 3, adding: 1 });
    expect(err.name).toBe("PlanLimitExceededError");
  });

  it("stores resource, current, limit, adding as properties", () => {
    const err = new PlanLimitExceededError({ resource: "usuarios", current: 5, limit: 5, adding: 2 });
    expect(err.resource).toBe("usuarios");
    expect(err.current).toBe(5);
    expect(err.limit).toBe(5);
    expect(err.adding).toBe(2);
  });

  it("is instanceof Error", () => {
    const err = new PlanLimitExceededError({ resource: "empleados", current: 1, limit: 1, adding: 1 });
    expect(err).toBeInstanceOf(Error);
  });

  it.each<PlanLimitResource>(["locaciones", "usuarios", "empleados", "almacenamiento"])(
    "accepts resource type: %s",
    (resource) => {
      const err = new PlanLimitExceededError({ resource, current: 1, limit: 1, adding: 1 });
      expect(err.resource).toBe(resource);
    },
  );
});

describe("PlanDowngradeBlockedError", () => {
  it("formats message with joined violations", () => {
    const err = new PlanDowngradeBlockedError({
      organizationId: "org1",
      targetPlanId: "plan-basic",
      violations: ["locaciones 5/3.", "empleados 20/10."],
    });
    expect(err.message).toBe("No se puede bajar de plan: locaciones 5/3. empleados 20/10.");
  });

  it("stores organizationId, targetPlanId, violations", () => {
    const err = new PlanDowngradeBlockedError({
      organizationId: "org1",
      targetPlanId: "plan-basic",
      violations: ["usuarios 15/5."],
    });
    expect(err.organizationId).toBe("org1");
    expect(err.targetPlanId).toBe("plan-basic");
    expect(err.violations).toEqual(["usuarios 15/5."]);
  });

  it("sets name to PlanDowngradeBlockedError", () => {
    const err = new PlanDowngradeBlockedError({ organizationId: "o", targetPlanId: "p", violations: [] });
    expect(err.name).toBe("PlanDowngradeBlockedError");
  });

  it("is instanceof Error", () => {
    const err = new PlanDowngradeBlockedError({ organizationId: "o", targetPlanId: "p", violations: [] });
    expect(err).toBeInstanceOf(Error);
  });
});

describe("getPlanLimitErrorMessage", () => {
  it("returns PlanLimitExceededError message when thrown", () => {
    const err = new PlanLimitExceededError({ resource: "empleados", current: 10, limit: 10, adding: 1 });
    expect(getPlanLimitErrorMessage(err, "fallback")).toBe(err.message);
  });

  it("returns generic Error message for non-plan errors", () => {
    const err = new Error("algo salio mal");
    expect(getPlanLimitErrorMessage(err, "fallback")).toBe("algo salio mal");
  });

  it("returns fallback for null", () => {
    expect(getPlanLimitErrorMessage(null, "fallback text")).toBe("fallback text");
  });

  it("returns fallback for plain string throws", () => {
    expect(getPlanLimitErrorMessage("unexpected string", "fallback text")).toBe("fallback text");
  });

  it("returns fallback when error message is only whitespace", () => {
    const err = new Error("   ");
    expect(getPlanLimitErrorMessage(err, "fallback text")).toBe("fallback text");
  });
});
