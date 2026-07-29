export type ScopeListKey = "locations" | "department_ids" | "position_ids" | "users";

export type AudienceScope = {
  locations: string[];
  department_ids: string[];
  position_ids: string[];
  users: string[];
};

export type ScopeSubject = {
  userId: string;
  locationId: string | null;
  departmentId: string | null;
  positionIds?: string[];
};

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function listFromUnknown(input: unknown) {
  if (!Array.isArray(input)) return [] as string[];
  return unique(input.map((value) => (typeof value === "string" ? value : "")));
}

export function parseAudienceScope(value: unknown): AudienceScope {
  if (!value || typeof value !== "object") {
    return { locations: [], department_ids: [], position_ids: [], users: [] };
  }

  const raw = value as Record<string, unknown>;
  return {
    locations: listFromUnknown(raw.locations),
    department_ids: listFromUnknown(raw.department_ids),
    position_ids: listFromUnknown(raw.position_ids),
    users: listFromUnknown(raw.users),
  };
}

export function hasScopeFilters(scope: AudienceScope) {
  return scope.locations.length > 0 || scope.department_ids.length > 0 || scope.position_ids.length > 0;
}

export function isAudienceUserOverride(scope: AudienceScope, subject: ScopeSubject) {
  return scope.users.includes(subject.userId);
}

export function matchesAudienceFilters(scope: AudienceScope, subject: ScopeSubject) {
  if (!hasScopeFilters(scope)) {
    return true;
  }

  const locationOk = scope.locations.length === 0
    ? true
    : Boolean(subject.locationId && scope.locations.includes(subject.locationId));

  const departmentOk = scope.department_ids.length === 0
    ? true
    : Boolean(subject.departmentId && scope.department_ids.includes(subject.departmentId));

  const employeePositionIds = subject.positionIds ?? [];
  const positionOk = scope.position_ids.length === 0
    ? true
    : employeePositionIds.some((positionId) => scope.position_ids.includes(positionId));

  return locationOk && departmentOk && positionOk;
}

/**
 * Un alcance armado SOLO con personas (sin ubicacion/departamento/puesto) es
 * privado: lo ven unicamente las personas listadas.
 *
 * Sin esto, `matchesAudienceFilters` no encuentra ningun filtro activo y
 * devuelve true para cualquiera, con lo que elegir a una persona terminaba
 * publicando el recurso a toda la organizacion — lo contrario de lo que el
 * formulario da a entender.
 *
 * Es la regla que ya aplican `current_user_matches_document_scope` en Postgres
 * ("a user-only scope remains private when the current user is not listed") y
 * `resolveAudienceContacts` al resolver destinatarios de notificaciones.
 */
export function isUserOnlyScope(scope: AudienceScope) {
  return scope.users.length > 0 && !hasScopeFilters(scope);
}

export function canSubjectAccessScope(scopeValue: unknown, subject: ScopeSubject) {
  const scope = parseAudienceScope(scopeValue);
  if (isAudienceUserOverride(scope, subject)) {
    return true;
  }
  if (isUserOnlyScope(scope)) {
    return false;
  }
  return matchesAudienceFilters(scope, subject);
}

export type MultiLocationScopeSubject = {
  userId: string;
  /** Sucursales efectivas: principal, secundarias y expansion de all_locations. */
  locationIds: string[];
  departmentId: string | null;
  positionIds?: string[];
};

/**
 * Misma decision que `canSubjectAccessScope`, para un sujeto con varias
 * sucursales efectivas: alcanza con que una de ellas satisfaga la dimension de
 * ubicacion, y las demas dimensiones se evaluan igual.
 *
 * Existe para que la lectura (documentos/avisos/checklists) y la resolucion de
 * destinatarios de notificaciones compartan una unica implementacion. Antes
 * eran dos copias que se separaron sin que nadie lo notara: la de lectura
 * combinaba las dimensiones con AND y la de notificaciones con OR.
 */
export function canSubjectAccessScopeInAnyLocation(
  scopeValue: unknown,
  subject: MultiLocationScopeSubject,
) {
  const locationIds = [...new Set(subject.locationIds.filter(Boolean))];

  if (locationIds.length === 0) {
    return canSubjectAccessScope(scopeValue, {
      userId: subject.userId,
      locationId: null,
      departmentId: subject.departmentId,
      positionIds: subject.positionIds ?? [],
    });
  }

  return locationIds.some((locationId) =>
    canSubjectAccessScope(scopeValue, {
      userId: subject.userId,
      locationId,
      departmentId: subject.departmentId,
      positionIds: subject.positionIds ?? [],
    }),
  );
}

export function enforceLocationPolicy(options: {
  requestedLocations: string[];
  allowedLocations: string[];
  fallbackToAllowedWhenEmpty: boolean;
}) {
  const requestedLocations = unique(options.requestedLocations);
  const allowedLocations = unique(options.allowedLocations);

  const effectiveLocations = requestedLocations.length === 0 && options.fallbackToAllowedWhenEmpty
    ? allowedLocations
    : requestedLocations;

  const invalidLocations = effectiveLocations.filter((locationId) => !allowedLocations.includes(locationId));
  if (invalidLocations.length > 0) {
    return {
      ok: false as const,
      invalidLocations,
    };
  }

  return {
    ok: true as const,
    locations: effectiveLocations,
  };
}
