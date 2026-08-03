import { describe, expect, it } from "vitest";

import {
  deriveScopeMode,
  effectiveScopeLocations,
  emitScopeForMode,
  makeScopeMatcher,
  scopeSubjectOverlapsLocations,
  validateScopeMode,
  type ScopeRestriction,
  type ScopeSelection,
} from "@/shared/lib/scope-selector-model";

const OPEN: ScopeRestriction = { restricted: false, availableLocationIds: ["loc-a", "loc-b", "loc-c"] };
const ACOTADO: ScopeRestriction = { restricted: true, availableLocationIds: ["loc-a", "loc-b"] };

function selection(partial: Partial<ScopeSelection> = {}): ScopeSelection {
  return { locations: [], departments: [], positions: [], users: [], ...partial };
}

describe("deriveScopeMode", () => {
  it("lee un alcance vacio como toda la organizacion", () => {
    expect(deriveScopeMode(selection(), OPEN)).toBe("all");
  });

  it("lee solo usuarios como personas especificas", () => {
    expect(deriveScopeMode(selection({ users: ["u1", "u2"] }), OPEN)).toBe("people");
  });

  it("lee cualquier filtro como grupo", () => {
    expect(deriveScopeMode(selection({ locations: ["loc-a"] }), OPEN)).toBe("group");
    expect(deriveScopeMode(selection({ departments: ["dep-1"] }), OPEN)).toBe("group");
    expect(deriveScopeMode(selection({ positions: ["pos-1"] }), OPEN)).toBe("group");
  });

  it("lee un filtro con usuarios sumados como grupo, no como personas", () => {
    expect(deriveScopeMode(selection({ departments: ["dep-1"], users: ["u1"] }), OPEN)).toBe("group");
  });

  it("para un autor acotado, sus locaciones completas son 'todas mis locaciones'", () => {
    expect(deriveScopeMode(selection({ locations: ["loc-b", "loc-a"] }), ACOTADO)).toBe("all");
  });

  it("para un autor acotado, un subconjunto de sus locaciones es un grupo", () => {
    expect(deriveScopeMode(selection({ locations: ["loc-a"] }), ACOTADO)).toBe("group");
  });

  it("no confunde 'todas mis locaciones' cuando ademas hay un departamento", () => {
    expect(deriveScopeMode(selection({ locations: ["loc-a", "loc-b"], departments: ["dep-1"] }), ACOTADO)).toBe(
      "group",
    );
  });

  it("sin restriccion, las mismas locaciones son un grupo", () => {
    expect(deriveScopeMode(selection({ locations: ["loc-a", "loc-b"] }), OPEN)).toBe("group");
  });

  it("ignora vacios y duplicados al deducir", () => {
    expect(deriveScopeMode(selection({ locations: ["", "  "], users: [" u1 ", "u1"] }), OPEN)).toBe("people");
  });
});

describe("emitScopeForMode", () => {
  it("en toda la organizacion no envia nada", () => {
    const emitted = emitScopeForMode("all", selection({ locations: ["loc-a"], users: ["u1"] }), OPEN);
    expect(emitted).toEqual({ locations: [], departments: [], positions: [], users: [] });
  });

  it("no arrastra los filtros marcados al pasar de grupo a toda la organizacion", () => {
    const armado = selection({ locations: ["loc-a"], departments: ["dep-1"], positions: ["pos-1"] });
    expect(emitScopeForMode("all", armado, OPEN).departments).toEqual([]);
    expect(emitScopeForMode("group", armado, OPEN).departments).toEqual(["dep-1"]);
  });

  it("en personas especificas no envia ningun filtro", () => {
    const emitted = emitScopeForMode(
      "people",
      selection({ locations: ["loc-a"], departments: ["dep-1"], users: ["u1"] }),
      OPEN,
    );
    expect(emitted).toEqual({ locations: [], departments: [], positions: [], users: ["u1"] });
  });

  it("un autor acotado envia sus locaciones explicitas en 'todas mis locaciones'", () => {
    // Un alcance vacio se leeria como difusion a toda la empresa.
    expect(emitScopeForMode("all", selection(), ACOTADO).locations).toEqual(["loc-a", "loc-b"]);
  });

  it("un autor acotado nunca envia un grupo sin locacion", () => {
    // Sin esto, "el departamento Cocina" viajaria como "Cocina en toda la empresa".
    const emitted = emitScopeForMode("group", selection({ departments: ["dep-1"] }), ACOTADO);
    expect(emitted.locations).toEqual(["loc-a", "loc-b"]);
    expect(emitted.departments).toEqual(["dep-1"]);
  });

  it("un autor acotado respeta la locacion que eligio", () => {
    const emitted = emitScopeForMode("group", selection({ locations: ["loc-a"] }), ACOTADO);
    expect(emitted.locations).toEqual(["loc-a"]);
  });

  it("un autor acotado en personas especificas no recibe locaciones inyectadas", () => {
    // Si las recibiera, el filtro alcanzaria a toda su locacion y las personas
    // elegidas solo sumarian encima.
    const emitted = emitScopeForMode("people", selection({ users: ["u1"] }), ACOTADO);
    expect(emitted.locations).toEqual([]);
    expect(emitted.users).toEqual(["u1"]);
  });
});

describe("effectiveScopeLocations", () => {
  it("sin restriccion y sin marcar nada, no filtra por locacion", () => {
    expect(effectiveScopeLocations([], OPEN)).toEqual([]);
  });

  it("con restriccion y sin marcar nada, filtra por las habilitadas", () => {
    expect(effectiveScopeLocations([], ACOTADO)).toEqual(["loc-a", "loc-b"]);
  });
});

describe("validateScopeMode", () => {
  it("bloquea un grupo sin ningun filtro", () => {
    const result = validateScopeMode({
      mode: "group",
      selection: selection(),
      restriction: OPEN,
      audienceCount: 0,
    });
    expect(result?.tone).toBe("block");
    expect(result?.text).toContain("Toda la organización");
  });

  it("a un autor acotado le ofrece la salida con su propio nombre", () => {
    const result = validateScopeMode({
      mode: "group",
      selection: selection(),
      restriction: ACOTADO,
      audienceCount: 0,
    });
    expect(result?.text).toContain("Todas mis locaciones");
  });

  it("bloquea personas especificas sin nadie elegido", () => {
    const result = validateScopeMode({
      mode: "people",
      selection: selection(),
      restriction: OPEN,
      audienceCount: 0,
    });
    expect(result).toEqual({ tone: "block", text: "Elegí al menos una persona." });
  });

  it("avisa sin bloquear cuando el grupo no alcanza a nadie", () => {
    const result = validateScopeMode({
      mode: "group",
      selection: selection({ departments: ["dep-1"] }),
      restriction: OPEN,
      audienceCount: 0,
    });
    expect(result?.tone).toBe("warn");
  });

  it("no objeta toda la organizacion aunque no haya nadie cargado", () => {
    expect(
      validateScopeMode({ mode: "all", selection: selection(), restriction: OPEN, audienceCount: 0 }),
    ).toBeNull();
  });

  it("no objeta un grupo que alcanza gente", () => {
    expect(
      validateScopeMode({
        mode: "group",
        selection: selection({ locations: ["loc-a"] }),
        restriction: OPEN,
        audienceCount: 3,
      }),
    ).toBeNull();
  });
});

describe("makeScopeMatcher", () => {
  const branchNameById = new Map([["loc-a", "Centro"]]);
  const departmentNameById = new Map([["dep-1", "Cocina"]]);
  const positionNameById = new Map([["pos-1", "Chef"]]);

  function matcher(sel: { locations?: string[]; departments?: string[]; positions?: string[] }) {
    return makeScopeMatcher({
      locations: sel.locations ?? [],
      departments: sel.departments ?? [],
      positions: sel.positions ?? [],
      branchNameById,
      departmentNameById,
      positionNameById,
    });
  }

  it("sin filtros alcanza a cualquiera", () => {
    expect(matcher({})({})).toBe(true);
  });

  it("exige que se cumplan todas las dimensiones marcadas", () => {
    const match = matcher({ locations: ["loc-a"], departments: ["dep-1"] });
    expect(match({ branch_id: "loc-a", department_id: "dep-1" })).toBe(true);
    expect(match({ branch_id: "loc-a", department_id: "dep-2" })).toBe(false);
    expect(match({ branch_id: "loc-b", department_id: "dep-1" })).toBe(false);
  });

  it("decide por el id y no por el nombre viejo cuando el id esta", () => {
    // Este es el caso que motiva llevar los ids a la pantalla: el empleado tiene
    // el texto libre desactualizado ("Chef") pero su puesto real es otro. El
    // servidor decide por position_id, y la previa tiene que decir lo mismo.
    const match = matcher({ positions: ["pos-1"] });
    expect(match({ position_id: "pos-9", position_label: "Chef" })).toBe(false);
    expect(match({ position_id: "pos-1", position_label: "Cocinero viejo" })).toBe(true);
  });

  it("cae al nombre solo cuando no hay id", () => {
    const match = matcher({ positions: ["pos-1"] });
    expect(match({ position_label: "Chef" })).toBe(true);
    expect(match({ position_label: "Bachero" })).toBe(false);
  });

  it("no alcanza a quien no tiene ni id ni nombre en una dimension filtrada", () => {
    expect(matcher({ departments: ["dep-1"] })({})).toBe(false);
  });
});

describe("makeScopeMatcher con varias locaciones por persona", () => {
  const branchNameById = new Map([
    ["loc-a", "Centro"],
    ["loc-b", "Norte"],
  ]);

  function matcher(locations: string[]) {
    return makeScopeMatcher({
      locations,
      departments: [],
      positions: [],
      branchNameById,
      departmentNameById: new Map(),
      positionNameById: new Map(),
    });
  }

  it("alcanza a quien tiene esa locación entre las suyas, aunque no sea su sucursal", () => {
    // La pregunta de fondo: al filtrar por una locación tienen que aparecer
    // todos los que la tengan, sea la única o una de varias.
    const match = matcher(["loc-b"]);
    expect(match({ branch_id: "loc-a", location_ids: ["loc-a", "loc-b"] })).toBe(true);
  });

  it("no alcanza a quien no la tiene en ninguna", () => {
    const match = matcher(["loc-b"]);
    expect(match({ branch_id: "loc-a", location_ids: ["loc-a"] })).toBe(false);
  });

  it("alcanza a quien tiene todas las locaciones aunque no tenga sucursal propia", () => {
    // El caso real: un empleado sin sucursal asignada pero con permiso de todas.
    // Antes quedaba afuera de cualquier filtro por locación.
    const match = matcher(["loc-a"]);
    expect(match({ branch_id: null, location_ids: ["loc-a", "loc-b"] })).toBe(true);
  });

  it("sin lista de locaciones cae a la sucursal propia", () => {
    // Los origenes de datos que todavia no traen location_ids siguen andando.
    const match = matcher(["loc-a"]);
    expect(match({ branch_id: "loc-a" })).toBe(true);
    expect(match({ branch_id: "loc-b" })).toBe(false);
  });

  it("sin filtro de locación alcanza a cualquiera", () => {
    expect(matcher([])({ branch_id: null, location_ids: [] })).toBe(true);
  });
});

describe("scopeSubjectOverlapsLocations", () => {
  it("incluye una locacion secundaria aunque la principal sea otra", () => {
    expect(
      scopeSubjectOverlapsLocations(
        { branch_id: "loc-a", location_ids: ["loc-a", "loc-b"] },
        ["loc-b"],
      ),
    ).toBe(true);
  });

  it("incluye a quien alcanza todas aunque no tenga locacion principal", () => {
    expect(
      scopeSubjectOverlapsLocations({ branch_id: null, location_ids: ["loc-a", "loc-b"] }, ["loc-b"]),
    ).toBe(true);
  });

  it("cae a la locacion principal cuando no hay lista efectiva", () => {
    expect(scopeSubjectOverlapsLocations({ branch_id: "loc-a" }, ["loc-a"])).toBe(true);
  });

  it("rechaza cuando no hay ninguna locacion en comun", () => {
    expect(
      scopeSubjectOverlapsLocations({ branch_id: "loc-a", location_ids: ["loc-a"] }, ["loc-b"]),
    ).toBe(false);
    expect(scopeSubjectOverlapsLocations({ branch_id: "loc-a" }, [])).toBe(false);
  });
});
