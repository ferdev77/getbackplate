export function formatDate(dateText: string) {
  return new Date(dateText).toLocaleDateString("es-US");
}

export function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isPreviewableMime(mimeType: string | null) {
  if (!mimeType) return false;
  return mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("text/");
}

export function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function parseScope(scope: unknown) {
  if (!scope || typeof scope !== "object") {
    return { locations: [] as string[], departments: [] as string[], positions: [] as string[], users: [] as string[] };
  }
  const value = scope as Record<string, unknown>;
  return {
    locations: Array.isArray(value.locations) ? value.locations.filter((x): x is string => typeof x === "string") : [],
    departments: Array.isArray(value.department_ids)
      ? value.department_ids.filter((x): x is string => typeof x === "string")
      : [],
    positions: Array.isArray(value.position_ids)
      ? value.position_ids.filter((x): x is string => typeof x === "string")
      : [],
    users: Array.isArray(value.users) ? value.users.filter((x): x is string => typeof x === "string") : [],
  };
}

export function hasAnyScopeValue(scope: ReturnType<typeof parseScope>) {
  return scope.locations.length > 0 || scope.departments.length > 0 || scope.positions.length > 0 || scope.users.length > 0;
}
