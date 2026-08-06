/**
 * Tope de tamano de los archivos que suben las empresas y los empleados.
 *
 * Vive en su propio archivo, sin dependencias, porque lo necesitan los dos
 * lados: las rutas de API (que ademas hablan con storage) y los formularios del
 * navegador. Importarlo desde direct-upload.ts arrastraria node:crypto al
 * bundle del cliente, y tenerlo copiado en cada pantalla ya habia dejado
 * mensajes desincronizados con la validacion real.
 */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;

export const MAX_UPLOAD_SIZE_LABEL = `${Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024))}MB`;

export function formatUploadMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
