import type { SupabaseClient } from "@supabase/supabase-js";

import { isBlockedUploadExtension, toSafeUploadName } from "@/shared/lib/file-security";

export const DOCUMENTS_BUCKET = "tenant-documents";
export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * Por que existe la subida directa
 * --------------------------------
 * La plataforma corta el cuerpo de cualquier request a las funciones en 4.5 MB
 * y responde 413 en texto plano, antes de que este codigo llegue a ejecutarse.
 * Un archivo de 6 MB nunca alcanzaba la validacion de 10 MB de mas abajo: moria
 * en el borde y el navegador recibia una respuesta que no era JSON.
 *
 * Por eso el archivo ya no viaja por la funcion. El navegador pide una URL
 * firmada, sube los bytes directo a storage, y despues llama al endpoint de
 * registro con la ruta resultante. La funcion nunca recibe el archivo, asi que
 * el limite del borde deja de aplicar.
 *
 * La validacion de seguridad no se relaja: al registrar se descargan los bytes
 * desde storage (una descarga saliente no tiene ese tope) y se corre el mismo
 * analyzeUploadedFile de siempre, con sniffing de firma y checksum.
 */

type SignedUploadTarget = {
  path: string;
  signedUrl: string;
  token: string;
};

export function buildStoragePath(prefix: string, fileName: string) {
  return `${prefix}/${Date.now()}-${toSafeUploadName(fileName)}`;
}

/**
 * Rechaza lo que se puede rechazar sin los bytes: tamano y extension prohibida.
 * El formato real se verifica al registrar, cuando ya hay contenido que oler.
 */
export function assertUploadCandidate(input: { fileName: string; fileSize: number }) {
  const size = Number(input.fileSize);

  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false as const, message: "Selecciona un archivo" };
  }
  if (size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false as const, message: "El archivo supera 10MB" };
  }
  if (isBlockedUploadExtension(input.fileName)) {
    return { ok: false as const, message: "Tipo de archivo bloqueado por seguridad" };
  }

  return { ok: true as const };
}

let bucketChecked = false;

export async function ensureDocumentsBucket(admin: SupabaseClient) {
  if (bucketChecked) return;

  const { data: bucket } = await admin.storage.getBucket(DOCUMENTS_BUCKET);
  if (!bucket) {
    await admin.storage.createBucket(DOCUMENTS_BUCKET, {
      public: false,
      fileSizeLimit: `${MAX_UPLOAD_SIZE_BYTES}`,
    });
  }

  bucketChecked = true;
}

export async function createSignedUploadTarget(
  admin: SupabaseClient,
  path: string,
): Promise<{ ok: true; target: SignedUploadTarget } | { ok: false; message: string }> {
  const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);

  if (error || !data) {
    return { ok: false, message: error?.message ?? "No se pudo preparar la subida" };
  }

  return { ok: true, target: { path: data.path, signedUrl: data.signedUrl, token: data.token } };
}

/**
 * Trae de vuelta lo que el navegador subio para poder analizarlo igual que
 * cuando el archivo llegaba por el formulario. Devuelve un File para no tener
 * que tocar analyzeUploadedFile.
 */
export async function readUploadedFile(
  admin: SupabaseClient,
  path: string,
  originalName: string,
): Promise<{ ok: true; file: File } | { ok: false; message: string }> {
  const { data, error } = await admin.storage.from(DOCUMENTS_BUCKET).download(path);

  if (error || !data) {
    return { ok: false, message: error?.message ?? "No se encontro el archivo subido" };
  }
  if (data.size <= 0) {
    return { ok: false, message: "El archivo subido llego vacio" };
  }
  if (data.size > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, message: "El archivo supera 10MB" };
  }

  return { ok: true, file: new File([data], originalName || "archivo", { type: data.type }) };
}

export async function removeUploadedFile(admin: SupabaseClient, path: string) {
  await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => undefined);
}
