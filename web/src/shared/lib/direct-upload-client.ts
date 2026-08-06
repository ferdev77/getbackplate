import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL, formatUploadMb } from "@/shared/lib/upload-limits";

/**
 * Lado navegador de la subida directa.
 *
 * El archivo no puede viajar dentro del formulario: el borde de la plataforma
 * corta cualquier cuerpo de mas de 4.5 MB y responde texto plano, antes de que
 * la funcion llegue a ejecutarse. El flujo es siempre el mismo: se pide una URL
 * firmada, se suben los bytes directo a storage y recien despues se llama al
 * endpoint de registro mandando solo la ruta.
 *
 * La contraparte de servidor esta en shared/lib/direct-upload.ts.
 */

export type DirectUploadResult =
  | { ok: true; path: string; originalName: string }
  | { ok: false; message: string; status?: number };

/**
 * Lee la respuesta sin asumir que es JSON. Cuando el borde rechaza algo,
 * contesta texto plano; leerlo con JSON.parse a secas dejaba al usuario con un
 * "respuesta invalida" que no explicaba nada.
 */
export function readUploadError(status: number, rawBody: string, fallback: string) {
  try {
    const parsed = JSON.parse(rawBody) as { error?: string; message?: string };
    const message = parsed.error ?? parsed.message;
    if (message) return message;
  } catch {
    if (status === 413) {
      return `El archivo es demasiado grande para enviarlo (máximo ${MAX_UPLOAD_SIZE_LABEL}).`;
    }
  }
  return fallback;
}

export function assertUploadSize(file: File): { ok: true } | { ok: false; message: string } {
  if (!(file instanceof File) || file.size <= 0) {
    return { ok: false, message: "Selecciona un archivo." };
  }
  if (file.size > MAX_UPLOAD_SIZE_BYTES) {
    return {
      ok: false,
      message: `El archivo pesa ${formatUploadMb(file.size)} y el máximo es ${MAX_UPLOAD_SIZE_LABEL}.`,
    };
  }
  return { ok: true };
}

export async function requestSignedUpload(
  uploadUrlEndpoint: string,
  file: File,
  extra: Record<string, unknown> = {},
): Promise<{ ok: true; path: string; signedUrl: string } | { ok: false; message: string; status?: number }> {
  let response: Response;
  try {
    response = await fetch(uploadUrlEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...extra, fileName: file.name, fileSize: file.size }),
    });
  } catch {
    return { ok: false, message: "No se pudo conectar con el servidor." };
  }

  const rawBody = await response.text();
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: readUploadError(response.status, rawBody, "No se pudo preparar la subida."),
    };
  }

  try {
    const data = JSON.parse(rawBody) as { path?: string; signedUrl?: string };
    if (!data.path || !data.signedUrl) {
      return { ok: false, message: "No se pudo preparar la subida." };
    }
    return { ok: true, path: data.path, signedUrl: data.signedUrl };
  } catch {
    return { ok: false, message: "No se pudo preparar la subida." };
  }
}

/**
 * Se sube con XHR y no con fetch solo por la barra de progreso: fetch no
 * reporta avance de carga.
 */
export function putFileToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (value: number) => void,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (progressEvent) => {
      if (!onProgress || !progressEvent.lengthComputable) return;
      const next = Math.round((progressEvent.loaded / progressEvent.total) * 100);
      // Se reserva el tramo final para el registro en la base.
      onProgress(Math.max(4, Math.min(next, 92)));
    };

    xhr.onerror = () => resolve({ ok: false, message: "Se interrumpió la subida del archivo." });

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true });
        return;
      }
      resolve({
        ok: false,
        message: readUploadError(xhr.status, xhr.responseText, "No se pudo subir el archivo."),
      });
    };

    xhr.send(file);
  });
}

/**
 * Los dos pasos juntos. Devuelve la ruta que hay que mandarle al endpoint de
 * registro en los campos storage_path y original_file_name.
 */
export async function uploadFileDirect(
  uploadUrlEndpoint: string,
  file: File,
  options: { extra?: Record<string, unknown>; onProgress?: (value: number) => void } = {},
): Promise<DirectUploadResult> {
  const size = assertUploadSize(file);
  if (!size.ok) return size;

  const signed = await requestSignedUpload(uploadUrlEndpoint, file, options.extra ?? {});
  if (!signed.ok) return signed;

  const uploaded = await putFileToSignedUrl(signed.signedUrl, file, options.onProgress);
  if (!uploaded.ok) return uploaded;

  return { ok: true, path: signed.path, originalName: file.name };
}
