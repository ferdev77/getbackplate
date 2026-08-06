/**
 * Carpeta de paso de los archivos del alta de empleados.
 *
 * El navegador sube ahi los bytes porque el empleado todavia no existe cuando
 * manda el formulario, asi que su ruta definitiva no se puede calcular. El POST
 * los copia a <org>/employees/<id>/... o <org>/users/<id>/... y borra el
 * original. Lo que quede sin reclamar lo levanta el barrido de huerfanos
 * (modules/documents/services/orphan-uploads.service.ts).
 */
export const EMPLOYEE_UPLOAD_STAGING_PREFIX = "staging/employees";
