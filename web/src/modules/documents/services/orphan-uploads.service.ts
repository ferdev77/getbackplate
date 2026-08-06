import { createSupabaseAdminClient } from "@/infrastructure/supabase/client/admin";
import { DOCUMENTS_BUCKET } from "@/shared/lib/direct-upload";

/**
 * Barre los archivos que quedaron en storage sin documento asociado.
 *
 * Aparecen porque la subida es directa: el navegador manda los bytes a storage
 * y recien despues llama al endpoint de registro. Si alguien cierra la pantalla
 * en el medio, los bytes quedan sin dueno. Los errores de validacion ya se
 * limpian solos en el propio endpoint; esto cubre el abandono.
 *
 * El bucket es compartido con contratos, adjuntos de mantenimiento, avatares y
 * checklists, asi que el barrido NO recorre el bucket entero. Solo mira los dos
 * lugares donde escribe la subida directa:
 *
 *   <org>/<timestamp>-<nombre>              -> panel de empresa
 *   <org>/employee-owned/<user>/<ts>-<nom>  -> portal de empleado
 *   <org>/staging/employees/<ts>-<nombre>   -> alta de empleados
 *   <org>/staging/maintenance/<ts>-<nom>    -> adjuntos de mantenimiento
 *
 * Los demas flujos siempre meten una subcarpeta con nombre propio (users/,
 * employees/, maintenance/, <submissionId>/), asi que nunca caen en el primer
 * patron, que toma unicamente archivos sueltos en la raiz de la organizacion.
 *
 * La carpeta de paso del alta es distinta a las otras dos: lo que cae ahi nunca
 * se registra en ninguna tabla, porque el handler copia los bytes a su ruta
 * definitiva y borra el original. Si algo sigue ahi despues de MIN_AGE_HOURS es
 * porque el formulario quedo a medias.
 *
 * Ademas de esa restriccion por ubicacion hay dos redes mas: solo se considera
 * lo que lleva mas de MIN_AGE_HOURS sin registrarse, y antes de borrar se
 * verifica contra las cuatro tablas que guardan rutas de este bucket.
 */

const MIN_AGE_HOURS = 24;
const LIST_PAGE_SIZE = 1000;
const MAX_CANDIDATES = 5000;

type StorageEntry = { name: string; id: string | null; created_at?: string | null };

function isFile(entry: StorageEntry) {
  // Supabase devuelve las carpetas como entradas sin id.
  return Boolean(entry.id);
}

async function listAll(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  prefix: string,
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .list(prefix, { limit: LIST_PAGE_SIZE, offset });

    if (error || !data || data.length === 0) break;

    entries.push(...(data as StorageEntry[]));
    if (data.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }

  return entries;
}

/**
 * Cruza contra todas las tablas que guardan rutas de este bucket, no solo
 * documents: si manana otro flujo empieza a escribir en estos prefijos, el
 * barrido lo respeta igual.
 */
async function findReferencedPaths(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  paths: string[],
): Promise<Set<string>> {
  const referenced = new Set<string>();
  if (paths.length === 0) return referenced;

  // Las tres tablas que guardan rutas de este bucket. employee_documents queda
  // fuera a proposito: no tiene columna de ruta, el expediente del empleado se
  // apoya en documents.
  const sources = [
    { table: "documents", column: "file_path" },
    { table: "checklist_item_attachments", column: "file_path" },
    { table: "maintenance_request_attachments", column: "file_path" },
  ] as const;

  for (const source of sources) {
    const { data, error } = await admin
      .from(source.table)
      .select(source.column)
      .in(source.column, paths);

    // Ante cualquier problema de lectura se prefiere no borrar: se marcan todas
    // las rutas como referenciadas y el barrido de esta tanda queda en nada.
    if (error) {
      paths.forEach((path) => referenced.add(path));
      return referenced;
    }

    for (const row of data ?? []) {
      const value = (row as Record<string, unknown>)[source.column];
      if (typeof value === "string") referenced.add(value);
    }
  }

  return referenced;
}

export async function purgeOrphanDocumentUploads(options: { dryRun?: boolean } = {}) {
  const dryRun = options.dryRun ?? false;
  const admin = createSupabaseAdminClient();
  const cutoff = Date.now() - MIN_AGE_HOURS * 60 * 60 * 1000;

  const { data: organizations, error: organizationsError } = await admin
    .from("organizations")
    .select("id");

  if (organizationsError) {
    return { ok: false as const, error: organizationsError.message, scanned: 0, deleted: 0, paths: [] as string[] };
  }

  const candidates: string[] = [];
  let scanned = 0;

  for (const organization of organizations ?? []) {
    const organizationId = String(organization.id);

    // 1. Archivos sueltos en la raiz de la organizacion (panel de empresa).
    const rootEntries = await listAll(admin, organizationId);
    for (const entry of rootEntries) {
      if (!isFile(entry)) continue;
      scanned += 1;
      if (entry.created_at && new Date(entry.created_at).getTime() < cutoff) {
        candidates.push(`${organizationId}/${entry.name}`);
      }
    }

    // 2. Carpetas por usuario del portal de empleado.
    const ownerFolders = await listAll(admin, `${organizationId}/employee-owned`);
    for (const owner of ownerFolders) {
      if (isFile(owner)) continue;
      const ownerPrefix = `${organizationId}/employee-owned/${owner.name}`;
      const ownerEntries = await listAll(admin, ownerPrefix);
      for (const entry of ownerEntries) {
        if (!isFile(entry)) continue;
        scanned += 1;
        if (entry.created_at && new Date(entry.created_at).getTime() < cutoff) {
          candidates.push(`${ownerPrefix}/${entry.name}`);
        }
      }
    }

    // 3. Carpetas de paso del alta de empleados y de mantenimiento.
    for (const staging of ["staging/employees", "staging/maintenance"]) {
      const stagingPrefix = `${organizationId}/${staging}`;
      const stagingEntries = await listAll(admin, stagingPrefix);
      for (const entry of stagingEntries) {
        if (!isFile(entry)) continue;
        scanned += 1;
        if (entry.created_at && new Date(entry.created_at).getTime() < cutoff) {
          candidates.push(`${stagingPrefix}/${entry.name}`);
        }
      }
    }

    if (candidates.length >= MAX_CANDIDATES) break;
  }

  const referenced = await findReferencedPaths(admin, candidates);
  const orphans = candidates.filter((path) => !referenced.has(path));

  if (dryRun || orphans.length === 0) {
    return { ok: true as const, dryRun, scanned, deleted: 0, paths: orphans };
  }

  const { error: removeError } = await admin.storage.from(DOCUMENTS_BUCKET).remove(orphans);
  if (removeError) {
    return { ok: false as const, error: removeError.message, scanned, deleted: 0, paths: orphans };
  }

  return { ok: true as const, dryRun, scanned, deleted: orphans.length, paths: orphans };
}
