type AccessScopeLike = {
  internal_only?: unknown;
};

const EMPLOYEE_PRIVATE_PREFIXES = [
  "Foto del Empleado - ",
  "ID / Identificacion - ",
  "SSN / EAD - ",
  "Numero de Seguro Social - ",
  "Food Handler Certificate - ",
  "Alcohol Server Certificate - ",
  "Food Protection Manager - ",
  "Carta de Recomendacion 1 - ",
  "Carta de Recomendacion 2 - ",
  "Otro Documento - ",
];

export function isEmployeePrivateDocument(accessScope: unknown, title: string | null | undefined) {
  const scope = typeof accessScope === "object" && accessScope !== null
    ? (accessScope as AccessScopeLike)
    : null;

  if (scope?.internal_only === true) {
    return true;
  }

  const safeTitle = String(title ?? "");
  return EMPLOYEE_PRIVATE_PREFIXES.some((prefix) => safeTitle.startsWith(prefix));
}
