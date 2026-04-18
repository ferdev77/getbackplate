const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function normalizePath(path: string) {
  return path.replace(/\\+/g, "/").trim();
}

type StoragePathValidationOptions = {
  allowLegacySeedPrefix?: boolean;
};

export function isSafeTenantStoragePath(
  path: string,
  organizationId: string,
  options: StoragePathValidationOptions = {},
) {
  const normalized = normalizePath(path);

  if (!normalized) return false;
  if (normalized.includes("..")) return false;
  if (normalized.startsWith("/")) return false;
  if (normalized.endsWith("/")) return false;
  if (normalized.startsWith(`${organizationId}/`)) {
    return true;
  }

  if (options.allowLegacySeedPrefix && normalized.startsWith("seed/")) {
    return true;
  }

  return false;
}

export function assertSafeTenantStoragePath(
  path: string,
  organizationId: string,
  options: StoragePathValidationOptions = {},
) {
  if (!isSafeTenantStoragePath(path, organizationId, options)) {
    throw new Error("Ruta de almacenamiento inválida para esta organización");
  }
}

export function isAllowedDocumentMime(mimeType: string | null | undefined) {
  return ALLOWED_MIME_TYPES.has(String(mimeType ?? "").toLowerCase());
}

export function isAllowedDocumentSize(bytes: number | null | undefined) {
  const value = Number(bytes ?? 0);
  return Number.isFinite(value) && value > 0 && value <= MAX_FILE_SIZE_BYTES;
}
