/**
 * Carpeta de paso de los adjuntos de mantenimiento.
 *
 * El navegador sube ahi los bytes antes de que exista la request; al adjuntar
 * se copian a <org>/maintenance/<requestId>/... y el original se borra. Lo que
 * quede sin reclamar lo levanta el barrido de huerfanos
 * (modules/documents/services/orphan-uploads.service.ts).
 */
export const MAINTENANCE_UPLOAD_STAGING_PREFIX = "staging/maintenance";
