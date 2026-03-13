import pg from "pg";
import { createClient } from "@supabase/supabase-js";

const { Client } = pg;

const DATABASE_URL = process.env.SUPABASE_DB_POOLER_URL;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const BUCKET_NAME = "tenant-documents";

if (!DATABASE_URL) {
  console.error("Falta SUPABASE_DB_POOLER_URL en el entorno.");
  process.exit(1);
}

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function normalizePath(path) {
  return String(path ?? "").replace(/\\+/g, "/").trim();
}

function isSafePath(path, organizationId, allowLegacySeedPrefix = false) {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (normalized.includes("..")) return false;
  if (normalized.startsWith("/")) return false;
  if (normalized.endsWith("/")) return false;
  if (normalized.startsWith(`${organizationId}/`)) return true;
  if (allowLegacySeedPrefix && normalized.startsWith("seed/")) return true;
  return false;
}

function isAllowedMime(mime) {
  return ALLOWED_MIME_TYPES.has(String(mime ?? "").toLowerCase());
}

function isAllowedSize(bytes) {
  const value = Number(bytes ?? 0);
  return Number.isFinite(value) && value > 0 && value <= MAX_FILE_SIZE_BYTES;
}

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const { rows: docs } = await client.query(
      `
      select id, organization_id, file_path, mime_type, file_size_bytes, created_at
      from public.documents
      order by created_at desc
      limit 500
      `,
    );

    let invalidPath = 0;
    let legacySeedPaths = 0;
    let invalidMime = 0;
    let invalidSize = 0;

    const badRows = [];
    const validRows = [];

    for (const row of docs) {
      const normalizedPath = normalizePath(row.file_path);
      const isLegacySeed = normalizedPath.startsWith("seed/");
      const pathOk = isSafePath(row.file_path, row.organization_id, true);
      const mimeOk = isAllowedMime(row.mime_type);
      const sizeOk = isAllowedSize(row.file_size_bytes);

      if (!pathOk) invalidPath += 1;
      if (isLegacySeed) legacySeedPaths += 1;
      if (!mimeOk) invalidMime += 1;
      if (!sizeOk) invalidSize += 1;

      if (!pathOk || !mimeOk || !sizeOk) {
        badRows.push({
          id: row.id,
          organization_id: row.organization_id,
          path_ok: pathOk,
          mime_ok: mimeOk,
          size_ok: sizeOk,
          mime_type: row.mime_type,
          file_size_bytes: Number(row.file_size_bytes ?? 0),
          file_path: normalizedPath,
        });
      } else {
        validRows.push(row);
      }
    }

    const strictValidRows = validRows.filter((row) =>
      normalizePath(row.file_path).startsWith(`${row.organization_id}/`),
    );

    let signedUrlFailures = 0;
    for (const row of strictValidRows.slice(0, 20)) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .createSignedUrl(normalizePath(row.file_path), 60);
      if (error || !data?.signedUrl) {
        signedUrlFailures += 1;
      }
    }

    console.table([
      {
        scanned_documents: docs.length,
        invalid_path_rows: invalidPath,
        legacy_seed_paths: legacySeedPaths,
        invalid_mime_rows: invalidMime,
        invalid_size_rows: invalidSize,
        signed_url_sample_failures: signedUrlFailures,
        signed_url_sample_size: Math.min(strictValidRows.length, 20),
      },
    ]);

    if (badRows.length > 0) {
      console.log("Filas invalidas detectadas (max 20):");
      console.table(badRows.slice(0, 20));
      throw new Error(`Guardrails invalidos en ${badRows.length} documento(s).`);
    }

    if (signedUrlFailures > 0) {
      throw new Error(`Fallaron ${signedUrlFailures} signed URL checks sobre muestra valida.`);
    }

    console.log("OK: guardrails de documentos validados (path/mime/size/signed-url).");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("ERROR verify-document-guardrails:", error.message);
  process.exit(1);
});
