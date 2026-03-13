import { createHash } from "node:crypto";

const BLOCKED_EXTENSIONS = new Set(["exe", "msi", "bat", "cmd", "com", "scr", "js", "vbs", "ps1", "sh", "jar"]);

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

function sanitizeFileName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9.\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function getFileExtension(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function detectMimeType(bytes: Uint8Array): string | null {
  if (bytes.length >= 4) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes.length >= 12) {
      if (bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp";
    }
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "application/zip";
  }
  return null;
}

export async function analyzeUploadedFile(file: File) {
  const originalName = file.name || "archivo";
  const safeName = sanitizeFileName(originalName) || "archivo";
  const extension = getFileExtension(safeName);
  const declaredMime = (file.type || "application/octet-stream").toLowerCase();

  if (extension && BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error("Tipo de archivo bloqueado por seguridad");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const signatureBytes = new Uint8Array(buffer.subarray(0, Math.min(buffer.length, 32)));
  const detectedMime = detectMimeType(signatureBytes);

  let normalizedMime = declaredMime;

  if (detectedMime && detectedMime !== "application/zip") {
    normalizedMime = detectedMime;
  }

  const isOfficeByExt = extension === "docx" || extension === "xlsx";
  if (detectedMime === "application/zip" && !isOfficeByExt) {
    throw new Error("Formato comprimido no permitido para este flujo");
  }

  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new Error("Formato de archivo no permitido");
  }

  const checksumSha256 = createHash("sha256").update(buffer).digest("hex");

  return {
    originalName,
    safeName,
    extension,
    declaredMime,
    detectedMime,
    normalizedMime,
    checksumSha256,
  };
}
