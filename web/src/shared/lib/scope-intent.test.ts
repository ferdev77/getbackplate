import { describe, expect, it } from "vitest";

import { assertScopeIntent, parseScopeIntent } from "@/shared/lib/scope-validation";

describe("parseScopeIntent", () => {
  it("acepta las tres intenciones conocidas", () => {
    expect(parseScopeIntent("all")).toBe("all");
    expect(parseScopeIntent("group")).toBe("group");
    expect(parseScopeIntent("people")).toBe("people");
  });

  it("descarta cualquier otra cosa", () => {
    for (const value of ["", "todos", "ALL", null, undefined, 3, {}]) {
      expect(parseScopeIntent(value)).toBeNull();
    }
  });
});

describe("assertScopeIntent", () => {
  it("no valida nada cuando la intencion no viene", () => {
    // Clientes viejos y llamadas directas a la API mantienen el comportamiento
    // anterior: un alcance vacio sigue siendo difusion total.
    expect(assertScopeIntent({ intent: undefined }).ok).toBe(true);
    expect(assertScopeIntent({ intent: "cualquiera", userIds: [] }).ok).toBe(true);
  });

  it("rechaza un grupo sin ningun filtro", () => {
    const result = assertScopeIntent({ intent: "group", userIds: ["u1"] });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("no marcaste");
  });

  it("acepta un grupo con cualquiera de las tres dimensiones", () => {
    expect(assertScopeIntent({ intent: "group", locationIds: ["loc-a"] }).ok).toBe(true);
    expect(assertScopeIntent({ intent: "group", departmentIds: ["dep-1"] }).ok).toBe(true);
    expect(assertScopeIntent({ intent: "group", positionIds: ["pos-1"] }).ok).toBe(true);
  });

  it("rechaza personas especificas sin nadie elegido", () => {
    const result = assertScopeIntent({ intent: "people", userIds: [] });
    expect(result.ok).toBe(false);
  });

  it("rechaza personas especificas combinadas con filtros", () => {
    // Es la combinacion que convertiria "solo estas 3" en "toda la locacion mas
    // estas 3", porque los usuarios suman alcance en vez de restarlo.
    const result = assertScopeIntent({ intent: "people", userIds: ["u1"], locationIds: ["loc-a"] });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.message).toContain("no se pueden combinar");
  });

  it("acepta personas especificas limpias", () => {
    expect(assertScopeIntent({ intent: "people", userIds: ["u1", "u2"] }).ok).toBe(true);
  });

  it("acepta toda la organizacion con las locaciones habilitadas de un autor acotado", () => {
    // Un autor con locaciones acotadas envia sus locaciones explicitas en el modo
    // "todas mis locaciones"; eso no es una incoherencia.
    expect(assertScopeIntent({ intent: "all", locationIds: ["loc-a", "loc-b"] }).ok).toBe(true);
  });

  it("ignora valores vacios al contar lo enviado", () => {
    const result = assertScopeIntent({ intent: "group", locationIds: ["", "   "] });
    expect(result.ok).toBe(false);
  });
});
