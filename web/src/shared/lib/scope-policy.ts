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

export function canSubjectAccessScope(scopeValue: unknown, subject: ScopeSubject) {
  const scope = parseAudienceScope(scopeValue);
  if (isAudienceUserOverride(scope, subject)) {
    return true;
  }
  return matchesAudienceFilters(scope, subject);
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
