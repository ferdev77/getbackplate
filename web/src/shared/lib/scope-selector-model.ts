/**
 * Las decisiones del selector de alcance, sin React.
 *
 * Vive aparte del componente para poder probarlas: que el modo se deduzca igual
 * que lo lee el servidor, que lo que se envia no arrastre filtros de un modo
 * anterior, y que un empleado con locaciones acotadas no pueda emitir un alcance
 * sin locacion. La regla de fondo esta en scope-policy.ts y en las funciones de
 * Postgres; aca solo se la construye.
 */

export type ScopeMode = "all" | "group" | "people";

export type ScopeSelection = {
  locations: string[];
  departments: string[];
  positions: string[];
  users: string[];
};

export type ScopeRestriction = {
  /** El autor solo puede alcanzar sus locaciones habilitadas. */
  restricted: boolean;
  availableLocationIds: string[];
};

function unique(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function sameSet(a: readonly string[], b: readonly string[]) {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((value) => setB.has(value));
}

export function hasScopeFilters(selection: ScopeSelection) {
  return (
    selection.locations.length > 0 ||
    selection.departments.length > 0 ||
    selection.positions.length > 0
  );
}

/**
 * El modo no se guarda en la base: se deduce de lo guardado, con la misma regla
 * que aplica el servidor (hasScopeFilters / isUserOnlyScope en scope-policy.ts).
 * Asi, abrir algo viejo a editar no lo reinterpreta.
 */
export function deriveScopeMode(stored: ScopeSelection, restriction: ScopeRestriction): ScopeMode {
  const locations = unique(stored.locations);
  const departments = unique(stored.departments);
  const positions = unique(stored.positions);
  const users = unique(stored.users);

  if (locations.length > 0 || departments.length > 0 || positions.length > 0) {
    // Un autor acotado guarda "todas mis locaciones" como filtro de locacion;
    // sin esto, abrir a editar lo mostraria siempre como un grupo armado a mano.
    const isAllOwnLocations =
      restriction.restricted &&
      departments.length === 0 &&
      positions.length === 0 &&
      users.length === 0 &&
      sameSet(locations, unique(restriction.availableLocationIds));

    return isAllOwnLocations ? "all" : "group";
  }

  return users.length > 0 ? "people" : "all";
}

/**
 * Las locaciones que de verdad filtran. Con locaciones acotadas y ninguna
 * marcada valen todas las habilitadas: la vista previa y lo que se envia tienen
 * que decir lo mismo.
 */
export function effectiveScopeLocations(selected: readonly string[], restriction: ScopeRestriction) {
  const locations = unique(selected);
  if (restriction.restricted && locations.length === 0) {
    return unique(restriction.availableLocationIds);
  }
  return locations;
}

/**
 * Lo que realmente se envia. Se deriva del modo, no del estado crudo: si alguien
 * arma un grupo y despues pasa a "toda la organizacion", los filtros que
 * quedaron marcados no viajan.
 */
export function emitScopeForMode(
  mode: ScopeMode,
  selection: ScopeSelection,
  restriction: ScopeRestriction,
): ScopeSelection {
  if (mode === "all") {
    return {
      // Un autor acotado no puede difundir a toda la empresa: su "todo" son sus
      // locaciones habilitadas, y viajan explicitas. Un alcance vacio se leeria
      // como difusion total.
      locations: restriction.restricted ? unique(restriction.availableLocationIds) : [],
      departments: [],
      positions: [],
      users: [],
    };
  }

  if (mode === "people") {
    return { locations: [], departments: [], positions: [], users: unique(selection.users) };
  }

  return {
    locations: effectiveScopeLocations(selection.locations, restriction),
    departments: unique(selection.departments),
    positions: unique(selection.positions),
    users: unique(selection.users),
  };
}

export type ScopeValidation = { tone: "block" | "warn"; text: string };

export function validateScopeMode(input: {
  mode: ScopeMode;
  selection: ScopeSelection;
  restriction: ScopeRestriction;
  audienceCount: number;
}): ScopeValidation | null {
  const { mode, selection, restriction, audienceCount } = input;

  if (mode === "group" && !hasScopeFilters(selection)) {
    return {
      tone: "block",
      text: `Elegí al menos una locación, departamento o puesto — o pasá a «${
        restriction.restricted ? "Todas mis locaciones" : "Toda la organización"
      }».`,
    };
  }

  if (mode === "people" && unique(selection.users).length === 0) {
    return { tone: "block", text: "Elegí al menos una persona." };
  }

  if (mode === "group" && audienceCount === 0) {
    return { tone: "warn", text: "Con esta combinación no hay nadie. Revisá los filtros." };
  }

  return null;
}

export type ScopeMatchSubject = {
  branch_id?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  location_label?: string;
  department_label?: string;
  position_label?: string;
};

/**
 * Compara por id, igual que el servidor. El nombre solo se usa cuando el origen
 * de datos no trae el id: si se comparara por nombre habiendo id, un puesto
 * renombrado a medias mostraria una audiencia distinta a la real (el servidor
 * decide por position_id desde la migracion 20260729000005).
 */
export function makeScopeMatcher(input: {
  locations: readonly string[];
  departments: readonly string[];
  positions: readonly string[];
  branchNameById: Map<string, string>;
  departmentNameById: Map<string, string>;
  positionNameById: Map<string, string>;
}) {
  function dimension(ids: readonly string[], nameById: Map<string, string>) {
    const idSet = new Set(unique(ids));
    const names = new Set<string>();
    for (const id of idSet) {
      const name = nameById.get(id);
      if (name) names.add(name);
    }
    return { idSet, names };
  }

  const loc = dimension(input.locations, input.branchNameById);
  const dep = dimension(input.departments, input.departmentNameById);
  const pos = dimension(input.positions, input.positionNameById);

  function ok(
    dim: { idSet: Set<string>; names: Set<string> },
    id: string | null | undefined,
    label: string | undefined,
  ) {
    if (dim.idSet.size === 0) return true;
    if (id) return dim.idSet.has(id);
    return Boolean(label && dim.names.has(label));
  }

  return (subject: ScopeMatchSubject) =>
    ok(loc, subject.branch_id, subject.location_label) &&
    ok(dep, subject.department_id, subject.department_label) &&
    ok(pos, subject.position_id, subject.position_label);
}
